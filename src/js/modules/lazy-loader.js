/**
 * Lazy Loader Module
 * Carga diferida de imágenes y contenido
 */

class LazyLoader {
    constructor(app) {
        this.app = app;
        this.observer = null;
        this.loadingQueue = [];
        this.isLoading = false;
        
        this.config = {
            rootMargin: '50px',
            threshold: 0.01,
            defaultImage: '/images/placeholder.jpg',
            errorImage: '/images/error.jpg',
            maxConcurrent: 3,
            retryAttempts: 2,
            retryDelay: 1000
        };
    }

    /**
     * Inicializar lazy loader
     */
    init() {
        this.setupIntersectionObserver();
        this.observeImages();
        this.setupEventListeners();
    }

    /**
     * Configurar Intersection Observer
     */
    setupIntersectionObserver() {
        if (!('IntersectionObserver' in window)) {
            // Fallback para navegadores sin soporte
            this.loadAllImages();
            return;
        }

        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            {
                rootMargin: this.config.rootMargin,
                threshold: this.config.threshold
            }
        );
    }

    /**
     * Manejar intersección
     */
    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                this.loadImage(entry.target);
                this.observer.unobserve(entry.target);
            }
        });
    }

    /**
     * Observar imágenes
     */
    observeImages() {
        const images = document.querySelectorAll('[data-lazy]');
        
        images.forEach(img => {
            // Establecer placeholder
            if (!img.src) {
                img.src = this.config.defaultImage;
            }
            
            // Observar
            if (this.observer) {
                this.observer.observe(img);
            }
        });
    }

    /**
     * Cargar imagen
     */
    async loadImage(element, url = null, attempts = 0) {
        const imageUrl = url || element.dataset.lazy;
        
        if (!imageUrl) return;

        try {
            // Agregar a cola si hay muchas cargas concurrentes
            if (this.loadingQueue.length >= this.config.maxConcurrent) {
                return this.queueImage(element, imageUrl);
            }

            this.loadingQueue.push(element);
            element.classList.add('loading');

            // Precargar imagen
            const img = new Image();
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageUrl;
            });

            // Aplicar imagen cargada con fade
            await this.applyImage(element, imageUrl);
            
            // Remover de cola
            this.loadingQueue = this.

            // Remover de cola
            this.loadingQueue = this.loadingQueue.filter(el => el !== element);
            
            // Procesar siguiente en cola
            this.processQueue();
            
        } catch (error) {
            console.error('Error loading image:', error);
            
            // Reintentar si quedan intentos
            if (attempts < this.config.retryAttempts) {
                setTimeout(() => {
                    this.loadImage(element, imageUrl, attempts + 1);
                }, this.config.retryDelay * (attempts + 1));
            } else {
                // Mostrar imagen de error
                element.src = this.config.errorImage;
                element.classList.remove('loading');
                element.classList.add('error');
            }
            
            // Remover de cola en caso de error
            this.loadingQueue = this.loadingQueue.filter(el => el !== element);
        }
    }

    /**
     * Aplicar imagen con transición
     */
    async applyImage(element, url) {
        return new Promise((resolve) => {
            // Fade out
            element.style.opacity = '0';
            
            setTimeout(() => {
                // Cambiar source
                if (element.tagName === 'IMG') {
                    element.src = url;
                } else {
                    // Para elementos con background-image
                    element.style.backgroundImage = `url(${url})`;
                }
                
                // Fade in
                element.style.opacity = '1';
                element.classList.remove('loading');
                element.classList.add('loaded');
                
                // Limpiar data attribute
                delete element.dataset.lazy;
                
                setTimeout(resolve, 300); // Esperar transición
            }, 300);
        });
    }

    /**
     * Agregar imagen a cola
     */
    queueImage(element, url) {
        if (!this.imageQueue) {
            this.imageQueue = [];
        }
        
        this.imageQueue.push({ element, url });
    }

    /**
     * Procesar cola de imágenes
     */
    processQueue() {
        if (!this.imageQueue || this.imageQueue.length === 0) return;
        
        if (this.loadingQueue.length < this.config.maxConcurrent) {
            const { element, url } = this.imageQueue.shift();
            this.loadImage(element, url);
        }
    }

    /**
     * Cargar todas las imágenes (fallback)
     */
    loadAllImages() {
        const images = document.querySelectorAll('[data-lazy]');
        images.forEach((img, index) => {
            setTimeout(() => {
                this.loadImage(img);
            }, index * 100); // Escalonar carga
        });
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Reobservar cuando se agregue contenido nuevo
        document.addEventListener('contentAdded', () => {
            this.observeImages();
        });
        
        // Pausar carga en scroll rápido
        let scrollTimeout;
        document.addEventListener('scroll', () => {
            document.body.classList.add('scrolling');
            
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                document.body.classList.remove('scrolling');
                this.processQueue();
            }, 200);
        });
    }

    /**
     * Precargar imagen específica
     */
    async preload(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = reject;
            img.src = url;
        });
    }

    /**
     * Precargar múltiples imágenes
     */
    async preloadMultiple(urls) {
        const promises = urls.map(url => this.preload(url));
        return Promise.allSettled(promises);
    }

    /**
     * Limpiar observer
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.loadingQueue = [];
        this.imageQueue = [];
    }
}
              

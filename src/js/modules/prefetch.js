/**
 * Prefetch Module
 * Precarga inteligente de recursos
 */

class Prefetch {
    constructor(app) {
        this.app = app;
        this.prefetchQueue = [];
        this.prefetching = new Set();
        this.prefetched = new Set();
        
        this.config = {
            maxConcurrent: 2,
            maxQueueSize: 20,
            strategies: {
                hover: true,
                visible: true,
                predicted: true
            },
            resourceTypes: {
                page: true,
                image: true,
                audio: false, // Consumo alto de ancho de banda
                api: true
            },
            priority: {
                high: [],
                medium: [],
                low: []
            },
            idleTimeout: 2000
        };
        
        this.networkInfo = this.getNetworkInfo();
    }

    /**
     * Inicializar prefetch
     */
    async init() {
        this.setupEventListeners();
        this.setupNetworkMonitoring();
        this.startIdlePrefetch();
        
        // Cargar configuración guardada
        await this.loadSavedState();
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Prefetch en hover
        if (this.config.strategies.hover) {
            document.addEventListener('mouseover', (e) => this.handleHover(e));
            document.addEventListener('focusin', (e) => this.handleFocus(e));
        }
        
        // Prefetch de elementos visibles
        if (this.config.strategies.visible) {
            this.setupIntersectionObserver();
        }
        
        // Prefetch predictivo basado en navegación
        if (this.config.strategies.predicted) {
            this.setupPredictivePrefetch();
        }
    }

    /**
     * Obtener información de red
     */
    getNetworkInfo() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            return {
                type: connection.type,
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt,
                saveData: connection.saveData
            };
        }
        
        return {
            type: 'unknown',
            effectiveType: '4g',
            saveData: false
        };
    }

    /**
     * Monitorear cambios de red
     */
    setupNetworkMonitoring() {
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', () => {
                this.networkInfo = this.getNetworkInfo();
                this.adjustStrategy();
            });
        }
    }

    /**
     * Ajustar estrategia según red
     */
    adjustStrategy() {
        const { effectiveType, saveData } = this.networkInfo;
        
        if (saveData) {
            // Modo ahorro de datos
            this.config.maxConcurrent = 1;
            this.config.resourceTypes.image = false;
            this.config.resourceTypes.audio = false;
            return;
        }
        
        switch (effectiveType) {
            case '4g':
                this.config.maxConcurrent = 3;
                this.config.resourceTypes.image = true;
                this.config.resourceTypes.audio = true;
                break;
            case '3g':
                this.config.maxConcurrent = 2;
                this.config.resourceTypes.image = true;
                this.config.resourceTypes.audio = false;
                break;
            case '2g':
            case 'slow-2g':
                this.config.maxConcurrent = 1;
                this.config.resourceTypes.image = false;
                this.config.resourceTypes.audio = false;
                break;
        }
    }

    /**
     * Manejar hover
     */
    handleHover(event) {
        const link = event.target.closest('a[href], [data-prefetch]');
        
        if (link) {
            const url = link.href || link.dataset.prefetch;
            const priority = link.dataset.prefetchPriority || 'medium';
            
            if (url && !this.prefetched.has(url)) {
                this.addToQueue(url, priority);
            }
        }
    }

    /**
     * Manejar focus (navegación con teclado)
     */
    handleFocus(event) {
        this.handleHover(event);
    }

    /**
     * Configurar Intersection Observer
     */
    setupIntersectionObserver() {
        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            {
                rootMargin: '100px',
                threshold: 0.01
            }
        );
        
        // Observar elementos con prefetch
        const elements = document.querySelectorAll('[data-prefetch-visible]');
        elements.forEach(el => this.observer.observe(el));
    }

    /**
     * Manejar intersección
     */
    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const url = entry.target.dataset.prefetchVisible;
                const priority = entry.target.dataset.prefetchPriority || 'low';
                
                if (url && !this.prefetched.has(url)) {
                    this.addToQueue(url, priority);
                }
                
                this.observer.unobserve(entry.target);
            }
        });
    }

    /**
     * Configurar prefetch predictivo
     */
    setupPredictivePrefetch() {
        // Analizar patrones de navegación
        this.navigationHistory = [];
        
        // Escuchar navegación
        this.app.on('navigate', (view) => {
            this.navigationHistory.push({
                view,
                timestamp: Date.now()
            });
            
            // Mantener solo últimas 20 navegaciones
            if (this.navigationHistory.length > 20) {
                this.navigationHistory.shift();
            }
            
            // Predecir siguiente vista
            this.predictNextView(view);
        });
    }

    /**
     * Predecir siguiente vista
     */
    predictNextView(currentView) {
        // Análisis simple de patrones
        const patterns = {
            'home': ['search', 'library', 'trending'],
            'search': ['artist', 'album', 'playlist'],
            'artist': ['album', 'similar'],
            'album': ['player', 'artist'],
            'library': ['playlist', 'favorites', 'history']
        };
        
        const predictions = patterns[currentView] || [];
        
        predictions.forEach(view => {
            const url = `/api/view/${view}`;
            if (!this.prefetched.has(url)) {
                this.addToQueue(url, 'low');
            }
        });
    }

    /**
     * Agregar a cola de prefetch
     */
    addToQueue(url, priority = 'medium') {
        // Verificar si ya está en cola o prefetched
        if (this.prefetched.has(url) || this.prefetching.has(url)) {
            return;
        }
        
        // Verificar límite de cola
        if (this.prefetchQueue.length >= this.config.maxQueueSize) {
            // Remover items de baja prioridad
            this.cleanQueue();
        }
        
        // Agregar a cola según prioridad
        const queueItem = { url, priority, timestamp: Date.now() };
        
        if (priority === 'high') {
            this.prefetchQueue.unshift(queueItem);
        } else {
            this.prefetchQueue.push(queueItem);
        }
        
        // Procesar cola
        this.processQueue();
    }

    /**
     * Limpiar cola
     */
    cleanQueue() {
        // Ordenar por prioridad y timestamp
        this.prefetchQueue.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            
            return b.timestamp - a.timestamp;
        });
        
        // Mantener solo los más importantes
        this.prefetchQueue = this.prefetchQueue.slice(0, this.config.maxQueueSize - 5);
    }

    /**
     * Procesar cola de prefetch
     */
    async processQueue() {
        // Verificar límite concurrente
        if (this.prefetching.size >= this.config.maxConcurrent) {
            return;
        }
        
        // Verificar si hay items en cola
        if (this.prefetchQueue.length === 0) {
            return;
        }
        
        // Tomar siguiente item
        const item = this.prefetchQueue.shift();
        
        if (item) {
            await this.prefetchResource(item.url);
        }
    }

    /**
     * Prefetch recurso
     */
    async prefetchResource(url) {
        // Marcar como en proceso
        this.prefetching.add(url);
        
        try {
            const resourceType = this.detectResourceType(url);
            
            // Verificar si el tipo está habilitado
            if (!this.config.resourceTypes[resourceType]) {
                return;
            }
            
            // Diferentes estrategias según tipo
            switch (resourceType) {
                case 'page':
                    await this.prefetchPage(url);
                    break;
                case 'image':
                    await this.prefetchImage(url);
                    break;
                case 'audio':
                    await this.prefetchAudio(url);
                    break;
                case 'api':
                    await this.prefetchAPI(url);
                    break;
            }
            
            // Marcar como completado
            this.prefetched.add(url);
            
        } catch (error) {
            console.warn('Prefetch failed:', url, error);
        } finally {
            // Remover de en proceso
            this.prefetching.delete(url);
            
            // Procesar siguiente
            this.processQueue();
        }
    }

    /**
     * Detectar tipo de recurso
     */
    detectResourceType(url) {
        if (url.includes('/api/')) return 'api';
        if (url.match(/\.(jpg|jpeg|png|webp|svg)$/i)) return 'image';
        if (url.match(/\.(mp3|m4a|opus|webm)$/i)) return 'audio';
        if (url.match(/\.html$/i) || !url.includes('.')) return 'page';
        
        return 'unknown';
    }

    /**
     * Prefetch página HTML
     */
    async prefetchPage(url) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        link.as = 'document';
        document.head.appendChild(link);
    }

    /**
     * Prefetch imagen
     */
    async prefetchImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });
    }

    /**
     * Prefetch audio
     */
    async prefetchAudio(url) {
        // Solo metadata, no el archivo completo
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = url;
    }

    /**
     * Prefetch API
     */
    async prefetchAPI(url) {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-Prefetch': 'true'
            }
        });
        
        if (response.ok) {
            // Cache automático por Service Worker
            return response;
        }
        
        throw new Error(`API prefetch failed: ${response.status}`);
    }

    /**
     * Iniciar prefetch en idle
     */
    startIdlePrefetch() {
        if ('requestIdleCallback' in window) {
            const idlePrefetch = (deadline) => {
                // Procesar mientras haya tiempo idle
                while (deadline.timeRemaining() > 0 && this.prefetchQueue.length > 0) {
                    this.processQueue();
                }
                
                // Programar siguiente
                if (this.prefetchQueue.length > 0) {
                    requestIdleCallback(idlePrefetch);
                }
            };
            
            // Iniciar cuando haya items en cola
            setInterval(() => {
                if (this.prefetchQueue.length > 0 && this.prefetching.size === 0) {
                    requestIdleCallback(idlePrefetch);
                }
            }, this.config.idleTimeout);
        }
    }

    /**
     * Guardar estado
     */
    saveState() {
        const state = {
            prefetched: Array.from(this.prefetched),
            navigationHistory: this.navigationHistory
        };
        
        localStorage.setItem('prefetchState', JSON.stringify(state));
    }

    /**
     * Cargar estado guardado
     */
    async loadSavedState() {
        try {
            const saved = localStorage.getItem('prefetchState');
            if (saved) {
                const state = JSON.parse(saved);
                this.prefetched = new Set(state.prefetched || []);
                this.navigationHistory = state.navigationHistory || [];
            }
        } catch (error) {
            console.error('Error loading prefetch state:', error);
        }
    }

    /**
     * Limpiar recursos prefetched antiguos
     */
    cleanup() {
        // Limpiar prefetched antiguos (más de 1 hora)
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 hora
        
        // Como no tenemos timestamps, limpiar todo periódicamente
        if (this.prefetched.size > 100) {
            this.prefetched.clear();
        }
    }

    /**
     * Obtener estadísticas
     */
    getStats() {
        return {
            prefetched: this.prefetched.size,
            prefetching: this.prefetching.size,
            queued: this.prefetchQueue.length,
            network: this.networkInfo
        };
    }

    /**
     * Destruir prefetch
     */
    destroy() {
        // Guardar estado
        this.saveState();
        
        // Limpiar observer
        if (this.observer) {
            this.observer.disconnect();
        }
        
        // Limpiar colas
        this.prefetchQueue = [];
        this.prefetching.clear();
    }
}

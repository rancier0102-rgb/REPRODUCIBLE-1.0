
/**
 * Core Application Manager
 * Gestiona el ciclo de vida de la aplicación para Smart TV
 */

class TVMusicApp {
    constructor() {
        this.config = {
            apiUrl: '/api',
            cacheVersion: 'v1.0.0',
            prefetchLimit: 10,
            scrollThreshold: 200,
            focusDebounce: 100
        };
        
        this.modules = {};
        this.currentView = 'home';
        this.isReady = false;
    }

    /**
     * Inicialización de la aplicación
     */
    async init() {
        try {
            // Detectar capacidades del dispositivo
            this.detectDevice();
            
            // Cargar módulos esenciales
            await this.loadModules();
            
            // Inicializar navegación
            this.initNavigation();
            
            // Configurar reproductor
            await this.initPlayer();
            
            // Registrar Service Worker
            await this.registerServiceWorker();
            
            // Cargar vista inicial
            await this.loadInitialView();
            
            this.isReady = true;
            this.emit('app:ready');
            
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showError('Error al iniciar la aplicación');
        }
    }

    /**
     * Detectar tipo de dispositivo y capacidades
     */
    detectDevice() {
        this.device = {
            type: 'tv', // tv, mobile, desktop
            platform: this.detectPlatform(),
            hasTouch: 'ontouchstart' in window,
            hasKeyboard: true,
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            pixelRatio: window.devicePixelRatio || 1
        };

        // Configuración específica por plataforma
        if (this.device.platform === 'webos') {
            this.configureWebOS();
        } else if (this.device.platform === 'tizen') {
            this.configureTizen();
        }
    }

    /**
     * Detectar plataforma de TV
     */
    detectPlatform() {
        const ua = navigator.userAgent.toLowerCase();
        
        if (ua.includes('webos')) return 'webos';
        if (ua.includes('tizen')) return 'tizen';
        if (ua.includes('androidtv')) return 'androidtv';
        if (ua.includes('appletv')) return 'appletv';
        if (ua.includes('roku')) return 'roku';
        
        return 'generic';
    }

    /**
     * Cargar módulos de la aplicación
     */
    async loadModules() {
        this.modules = {
            player: new MusicPlayer(this),
            navigation: new TVNavigation(this),
            cache: new CacheManager(this),
            lazyLoader: new LazyLoader(this),
            virtualScroll: new VirtualScroll(this),
            prefetch: new Prefetch(this)
        };

        // Inicializar módulos
        for (const [name, module] of Object.entries(this.modules)) {
            if (module.init) {
                await module.init();
            }
        }
    }

    /**
     * Inicializar navegación
     */
    initNavigation() {
        // Prevenir comportamiento por defecto del navegador
        document.addEventListener('keydown', (e) => {
            if ([37, 38, 39, 40, 13, 27, 8].includes(e.keyCode)) {
                e.preventDefault();
            }
        });

        // Gestión de foco
        this.focusManager = new FocusManager();
        
        // Eventos de navegación
        this.on('navigate', (view) => {
            this.loadView(view);
        });
    }

    /**
     * Inicializar reproductor
     */
    async initPlayer() {
        await this.modules.player.setup();
        
        // Eventos del reproductor
        this.modules.player.on('play', (track) => {
            this.updateNowPlaying(track);
        });

        this.modules.player.on('error', (error) => {
            this.showError('Error de reproducción');
        });
    }

    /**
     * Registrar Service Worker
     */
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered:', registration);
                
                // Actualizar cache si hay nueva versión
                registration.addEventListener('updatefound', () => {
                    this.handleCacheUpdate();
                });
                
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    /**
     * Cargar vista inicial
     */
    async loadInitialView() {
        // Verificar si hay sesión guardada
        const lastView = localStorage.getItem('lastView') || 'home';
        await this.loadView(lastView);
    }

    /**
     * Cargar vista específica
     */
    async loadView(viewName) {
        try {
            this.showLoading();
            
            // Limpiar vista anterior
            this.cleanupCurrentView();
            
            // Cargar nueva vista
            const viewModule = await this.loadViewModule(viewName);
            await viewModule.render();
            
            this.currentView = viewName;
            localStorage.setItem('lastView', viewName);
            
            // Actualizar navegación
            this.modules.navigation.updateView(viewName);
            
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading view:', error);
            this.showError('Error al cargar la vista');
        }
    }

    /**
     * Cargar módulo de vista dinámicamente
     */
    async loadViewModule(viewName) {
        const module = await import(`./views/${viewName}.js`);
        return new module.default(this);
    }

    /**
     * Limpiar vista actual
     */
    cleanupCurrentView() {
        const container = document.getElementById('app-container');
        if (container) {
            // Limpiar event listeners
            container.replaceWith(container.cloneNode(false));
        }
    }

    /**
     * Sistema de eventos
     */
    on(event, callback) {
        if (!this.events) this.events = {};
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    }

    emit(event, data) {
        if (!this.events || !this.events[event]) return;
        this.events[event].forEach(callback => callback(data));
    }

    /**
     * Utilidades UI
     */
    showLoading() {
        const loader = document.getElementById('loading-screen');
        if (loader) loader.classList.add('active');
    }

    hideLoading() {
        const loader = document.getElementById('loading-screen');
        if (loader) loader.classList.remove('active');
    }

    showError(message) {
        const errorModal = document.getElementById('error-modal');
        if (errorModal) {
            errorModal.querySelector('.error-message').textContent = message;
            errorModal.classList.add('active');
            
            setTimeout(() => {
                errorModal.classList.remove('active');
            }, 5000);
        }
    }

    /**
     * Actualizar Now Playing
     */
    updateNowPlaying(track) {
        const nowPlaying = document.getElementById('now-playing');
        if (nowPlaying) {
            nowPlaying.querySelector('.track-title').textContent = track.title;
            nowPlaying.querySelector('.track-artist').textContent = track.artist;
            
            // Actualizar imagen con lazy loading
            this.modules.lazyLoader.loadImage(
                nowPlaying.querySelector('.track-cover'),
                track.cover
            );
        }
    }

    /**
     * Configuraciones específicas de WebOS
     */
    configureWebOS() {
        if (window.webOS) {
            // Configurar teclas de control remoto
            window.webOS.platformBack = () => {
                this.handleBackButton();
            };
        }
    }

    /**
     * Configuraciones específicas de Tizen
     */
    configureTizen() {
        if (window.tizen) {
            // Registrar teclas
            ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop'].forEach(key => {
                try {
                    window.tizen.tvinputdevice.registerKey(key);
                } catch (error) {
                    console.warn(`Could not register key: ${key}`);
                }
            });
        }
    }

    /**
     * Manejo del botón Back/Return
     */
    handleBackButton() {
        if (this.currentView === 'home') {
            // Salir de la aplicación
            if (window.tizen) {
                window.tizen.application.getCurrentApplication().exit();
            } else if (window.webOS) {
                window.webOS.platformBack();
            }
        } else {
            // Volver a home
            this.loadView('home');
        }
    }
}

/**
 * Gestor de foco para navegación
 */
class FocusManager {
    constructor() {
        this.currentFocus = null;
        this.focusableElements = [];
        this.focusHistory = [];
    }

    update() {
        this.focusableElements = Array.from(
            document.querySelectorAll('[data-focusable="true"]:not([disabled])')
        );
        
        if (!this.currentFocus && this.focusableElements.length > 0) {
            this.setFocus(this.focusableElements[0]);
        }
    }

    setFocus(element) {
        if (this.currentFocus) {
            this.currentFocus.classList.remove('focused');
        }
        
        this.currentFocus = element;
        element.classList.add('focused');
        element.focus();
        
        // Scroll into view si es necesario
        this.ensureVisible(element);
        
        // Guardar en historial
        this.focusHistory.push(element);
        if (this.focusHistory.length > 10) {
            this.focusHistory.shift();
        }
    }

    ensureVisible(element) {
        const rect = element.getBoundingClientRect();
        const viewHeight = window.innerHeight;
        const viewWidth = window.innerWidth;
        
        if (rect.bottom > viewHeight || rect.top < 0) {
            element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
        
        if (rect.right > viewWidth || rect.left < 0) {
            element.scrollIntoView({ 
                behavior: 'smooth', 
                inline: 'center' 
            });
        }
    }

    getFocusableInDirection(direction) {
        if (!this.currentFocus) return null;
        
        const currentRect = this.currentFocus.getBoundingClientRect();
        const candidates = [];
        
        this.focusableElements.forEach(element => {
            if (element === this.currentFocus) return;
            
            const rect = element.getBoundingClientRect();
            const distance = this.calculateDistance(currentRect, rect);
            
            if (this.isInDirection(currentRect, rect, direction)) {
                candidates.push({ element, distance });
            }
        });
        
        candidates.sort((a, b) => a.distance - b.distance);
        return candidates[0]?.element || null;
    }

    calculateDistance(rect1, rect2) {
        const center1 = {
            x: rect1.left + rect1.width / 2,
            y: rect1.top + rect1.height / 2
        };
        const center2 = {
            x: rect2.left + rect2.width / 2,
            y: rect2.top + rect2.height / 2
        };
        
        return Math.sqrt(
            Math.pow(center2.x - center1.x, 2) + 
            Math.pow(center2.y - center1.y, 2)
        );
    }

    isInDirection(from, to, direction) {
        switch (direction) {
            case 'up':
                return to.bottom <= from.top;
            case 'down':
                return to.top >= from.bottom;
            case 'left':
                return to.right <= from.left;
            case 'right':
                return to.left >= from.right;
            default:
                return false;
        }
    }
}

// Inicializar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.tvMusicApp = new TVMusicApp();
    window.tvMusicApp.init();
});

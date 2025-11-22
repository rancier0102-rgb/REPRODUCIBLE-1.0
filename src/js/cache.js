/**
 * Cache Manager con Service Worker
 * Gestión avanzada de caché para offline y optimización
 */

class CacheManager {
    constructor(app) {
        this.app = app;
        this.version = 'v1.0.0';
        this.cacheNames = {
            static: `static-${this.version}`,
            dynamic: `dynamic-${this.version}`,
            audio: `audio-${this.version}`,
            images: `images-${this.version}`,
            api: `api-${this.version}`
        };
        
        this.config = {
            maxAge: {
                static: 30 * 24 * 60 * 60 * 1000, // 30 días
                dynamic: 7 * 24 * 60 * 60 * 1000, // 7 días
                audio: 14 * 24 * 60 * 60 * 1000, // 14 días
                images: 30 * 24 * 60 * 60 * 1000, // 30 días
                api: 5 * 60 * 1000 // 5 minutos
            },
            maxItems: {
                dynamic: 50,
                audio: 100,
                images: 200,
                api: 20
            },
            strategies: {
                static: 'cacheFirst',
                dynamic: 'networkFirst',
                audio: 'cacheFirst',
                images: 'cacheFirst',
                api: 'networkFirst'
            }
        };
    }

    /**
     * Inicializar cache manager
     */
    async init() {
        // Limpiar caches antiguos
        await this.cleanOldCaches();
        
        // Precargar recursos esenciales
        await this.precacheResources();
        
        // Configurar sincronización en background
        this.setupBackgroundSync();
        
        // Monitorear uso de storage
        this.monitorStorageUsage();
    }

    /**
     * Precargar recursos esenciales
     */
    async precacheResources() {
        const staticResources = [
            '/',
            '/index.html',
            '/css/styles.css',
            '/js/app.js',
            '/js/player.js',
            '/js/navigation.js',
            '/manifest.json',
            '/images/logo.png',
            '/images/placeholder.jpg',
            '/sounds/navigate.mp3',
            '/sounds/select.mp3'
        ];
        
        try {
            const cache = await caches.open(this.cacheNames.static);
            await cache.addAll(staticResources);
            console.log('Static resources precached');
        } catch (error) {
            console.error('Error precaching resources:', error);
        }
    }

    /**
     * Limpiar caches antiguos
     */
    async cleanOldCaches() {
        const cacheWhitelist = Object.values(this.cacheNames);
        const cacheNames = await caches.keys();
        
        const deletionPromises = cacheNames
            .filter(name => !cacheWhitelist.includes(name))
            .map(name => caches.delete(name));
        
        await Promise.all(deletionPromises);
    }

    /**
     * Estrategia Cache First
     */
    async cacheFirst(request) {
        const cached = await caches.match(request);
        
        if (cached) {
            // Actualizar en background si es necesario
            this.refreshInBackground(request);
            return cached;
        }
        
        try {
            const response = await fetch(request);
            
            if (response.ok) {
                const cache = await this.getCacheForRequest(request);
                cache.put(request, response.clone());
            }
            
            return response;
        } catch (error) {
            // Intentar fallback
            return this.getFallbackResponse(request);
        }
    }

    /**
     * Estrategia Network First
     */
    async networkFirst(request, timeout = 5000) {
        try {
            const networkPromise = fetch(request);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Network timeout')), timeout)
            );
            
            const response = await Promise.race([networkPromise, timeoutPromise]);
            
            if (response.ok) {
                const cache = await this.getCacheForRequest(request);
                cache.put(request, response.clone());
            }
            
            return response;
        } catch (error) {
            // Fallback a cache
            const cached = await caches.match(request);
            if (cached) return cached;
            
            // Último recurso: fallback
            return this.getFallbackResponse(request);
        }
    }

    /**
     * Estrategia Stale While Revalidate
     */
    async staleWhileRevalidate(request) {
        const cached = await caches.match(request);
        
        const networkPromise = fetch(request).then(async response => {
            if (response.ok) {
                const cache = await this.getCacheForRequest(request);
                cache.put(request, response.clone());
            }
            return response;
        });
        
        return cached || networkPromise;
    }

    /**
     * Obtener cache apropiado para request
     */
    async getCacheForRequest(request) {
        const url = new URL(request.url);
        
        if (url.pathname.includes('/api/')) {
            return caches.open(this.cacheNames.api);
        } else if (url.pathname.match(/\.(mp3|m4a|opus|webm)$/)) {
            return caches.open(this.cacheNames.audio);
        } else if (url.pathname.match(/\.(jpg|jpeg|png|webp|svg)$/)) {
            return caches.open(this.cacheNames.images);
        } else if (url.pathname.match(/\.(js|css)$/)) {
            return caches.open(this.cacheNames.static);
        } else {
            return caches.open(this.cacheNames.dynamic);
        }
    }

    /**
     * Actualizar cache en background
     */
    async refreshInBackground(request) {
        try {
            const response = await fetch(request);
            
            if (response.ok) {
                const cache = await this.getCacheForRequest(request);
                await cache.put(request, response);
            }
        } catch (error) {
            // Silencioso, es background refresh
        }
    }

    /**
     * Obtener respuesta de fallback
     */
    getFallbackResponse(request) {
        const url = new URL(request.url);
        
        if (url.pathname.match(/\.(jpg|jpeg|png|webp)$/)) {
            return caches.match('/images/placeholder.jpg');
        } else if (url.pathname.includes('/api/')) {
            return new Response(JSON.stringify({
                error: 'Offline',
                message: 'Sin conexión a Internet'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            return caches.match('/offline.html');
        }
    }

    /**
     * Configurar Background Sync
     */
    setupBackgroundSync() {
        if ('sync' in self.registration) {
            // Registrar sync tags
            this.registerSyncTags();
            
            // Escuchar eventos de sync
            self.addEventListener('sync', event => {
                if (event.tag === 'sync-queue') {
                    event.waitUntil(this.syncQueue());
                } else if (event.tag === 'sync-favorites') {
                    event.waitUntil(this.syncFavorites());
                }
            });
        }
    }

    /**
     * Registrar tags de sincronización
     */
    async registerSyncTags() {
        try {
            await self.registration.sync.register('sync-queue');
            await self.registration.sync.register('sync-favorites');
        } catch (error) {
            console.error('Error registering sync:', error);
        }
    }

    /**
     * Sincronizar cola de reproducción
     */
    async syncQueue() {
        const db = await this.openIndexedDB();
        const tx = db.transaction(['queue'], 'readonly');
        const store = tx.objectStore('queue');
        const queue = await store.getAll();
        
        if (queue.length > 0) {
            try {
                const response = await fetch('/api/sync/queue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ queue })
                });
                
                if (response.ok) {
                    // Limpiar cola local después de sincronizar
                    const deleteTx = db.transaction(['queue'], 'readwrite');
                    await deleteTx.objectStore('queue').clear();
                }
            } catch (error) {
                console.error('Error syncing queue:', error);
            }
        }
    }

    /**
     * Monitorear uso de storage
     */
    async monitorStorageUsage() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const percentUsed = (usage / quota) * 100;
            
            console.log(`Storage: ${(usage / 1024 / 1024).toFixed(2)}MB / ${(quota / 1024 / 1024).toFixed(2)}MB (${percentUsed.toFixed(2)}%)`);
            
            // Si se está usando más del 80%, limpiar cache
            if (percentUsed > 80) {
                await this.cleanupCache();
            }
        }
    }

    /**
     * Limpiar cache según políticas
     */
    async cleanupCache() {
        const caches = [
            { name: this.cacheNames.dynamic, maxItems: this.config.maxItems.dynamic },
            { name: this.cacheNames.audio, maxItems: this.config.maxItems.audio },
            { name: this.cacheNames.images, maxItems: this.config.maxItems.images },
            { name: this.cacheNames.api, maxItems: this.config.maxItems.api }
        ];
        
        for (const { name, maxItems } of caches) {
            const cache = await caches.open(name);
            const requests = await cache.keys();
            
            if (requests.length > maxItems) {
                // Eliminar los más antiguos
                const toDelete = requests.slice(0, requests.length - maxItems);
                
                for (const request of toDelete) {
                    await cache.delete(request);
                }
            }
        }
    }

    /**
     * Cache de audio inteligente
     */
    async cacheAudio(track) {
        const cache = await caches.open(this.cacheNames.audio);
        const url = `/api/stream?id=${track.id}`;
        
        // Verificar si ya está en cache
        const cached = await cache.match(url);
        if (cached) return cached;
        
        try {
            // Descargar con progress
            const response = await this.fetchWithProgress(url, (progress) => {
                this.app.emit('cache:progress', { track, progress });
            });
            
            if (response.ok) {
                await cache.put(url, response.clone());
                this.app.emit('cache:complete', { track });
            }
            
            return response;
        } catch (error) {
            console.error('Error caching audio:', error);
            throw error;
        }
    }

    /**
     * Fetch con progreso
     */
    async fetchWithProgress(url, onProgress) {
        const response = await fetch(url);
        
        if (!response.body) return response;
        
        const contentLength = response.headers.get('content-length');
        if (!contentLength) return response;
        
        const total = parseInt(contentLength, 10);
        let loaded = 0;
        
        const reader = response.body.getReader();
        const chunks = [];
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            chunks.push(value);
            loaded += value.length;
            
            if (onProgress) {
                onProgress((loaded / total) * 100);
            }
        }
        
        const blob = new Blob(chunks);
        return new Response(blob, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText
        });
    }

    /**
     * Abrir IndexedDB
     */
    openIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TVMusicApp', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('queue')) {
                    db.createObjectStore('queue', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('favorites')) {
                    db.createObjectStore('favorites', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('playlists')) {
                    db.createObjectStore('playlists', { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * Guardar en IndexedDB
     */
    async saveToIndexedDB(storeName, data) {
        const db = await this.openIndexedDB();
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        
        if (Array.isArray(data)) {
            for (const item of data) {
                await store.put(item);
            }
        } else {
            await store.put(data);
        }
        
        return tx.complete;
    }

    /**
     * Obtener de IndexedDB
     */
    async getFromIndexedDB(storeName, key) {
        const db = await this.openIndexedDB();
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        
        if (key) {
            return store.get(key);
        } else {
            return store.getAll();
        }
    }

    /**
     * Eliminar de IndexedDB
     */
    async deleteFromIndexedDB(storeName, key) {
        const db = await this.openIndexedDB();
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        
        if (key) {
            return store.delete(key);
        } else {
            return store.clear();
        }
    }
}

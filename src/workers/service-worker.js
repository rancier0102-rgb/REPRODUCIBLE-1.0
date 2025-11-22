/**
 * Service Worker para Smart TV Music App
 * Cache inteligente con estrategias optimizadas para streaming
 * Version: 1.0.0
 */

const CACHE_VERSION = 'v1.0.0';
const CACHE_PREFIX = 'tv-music-app';

// Nombres de caches
const CACHES = {
    STATIC: `${CACHE_PREFIX}-static-${CACHE_VERSION}`,
    DYNAMIC: `${CACHE_PREFIX}-dynamic-${CACHE_VERSION}`,
    MEDIA: `${CACHE_PREFIX}-media-${CACHE_VERSION}`,
    IMAGES: `${CACHE_PREFIX}-images-${CACHE_VERSION}`,
    API: `${CACHE_PREFIX}-api-${CACHE_VERSION}`
};

// Recursos estáticos para precache
const STATIC_RESOURCES = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/tv-layout.css',
    '/css/animations.css',
    '/css/themes/dark.css',
    '/css/themes/light.css',
    '/js/app.js',
    '/js/player.js',
    '/js/navigation.js',
    '/js/cache.js',
    '/js/modules/lazy-loader.js',
    '/js/modules/virtual-scroll.js',
    '/js/modules/prefetch.js',
    '/fonts/main.woff2',
    '/images/logo.png',
    '/images/placeholder.jpg',
    '/sounds/navigate.mp3',
    '/sounds/select.mp3',
    '/offline.html'
];

// Configuración de estrategias de cache
const CACHE_STRATEGIES = {
    '/api/': 'networkFirst',
    '/stream/': 'cacheFirst',
    '/images/': 'cacheFirst',
    '/static/': 'cacheFirst',
    '/': 'staleWhileRevalidate'
};

// Límites de cache
const CACHE_LIMITS = {
    DYNAMIC: 50,
    MEDIA: 100,
    IMAGES: 200,
    API: 30
};

// Tiempos de expiración (en segundos)
const CACHE_EXPIRATION = {
    STATIC: 30 * 24 * 60 * 60, // 30 días
    DYNAMIC: 7 * 24 * 60 * 60, // 7 días
    MEDIA: 14 * 24 * 60 * 60, // 14 días
    IMAGES: 30 * 24 * 60 * 60, // 30 días
    API: 5 * 60 // 5 minutos
};

// ============================================
// Eventos del Service Worker
// ============================================

/**
 * Evento Install - Precache de recursos estáticos
 */
self.addEventListener('install', event => {
    console.log('[SW] Installing Service Worker...');
    
    event.waitUntil(
        caches.open(CACHES.STATIC)
            .then(cache => {
                console.log('[SW] Precaching static resources...');
                return cache.addAll(STATIC_RESOURCES);
            })
            .then(() => {
                console.log('[SW] Service Worker installed successfully');
                // Activar inmediatamente
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Error during installation:', error);
            })
    );
});

/**
 * Evento Activate - Limpieza de caches antiguos
 */
self.addEventListener('activate', event => {
    console.log('[SW] Activating Service Worker...');
    
    event.waitUntil(
        cleanOldCaches()
            .then(() => {
                console.log('[SW] Service Worker activated successfully');
                // Tomar control de todos los clientes
                return self.clients.claim();
            })
    );
});

/**
 * Evento Fetch - Interceptar peticiones de red
 */
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorar peticiones no-GET
    if (request.method !== 'GET') {
        return;
    }
    
    // Ignorar extensiones del navegador
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
        return;
    }
    
    // Determinar estrategia de cache
    const strategy = getStrategyForRequest(request);
    
    switch (strategy) {
        case 'cacheFirst':
            event.respondWith(cacheFirst(request));
            break;
        case 'networkFirst':
            event.respondWith(networkFirst(request));
            break;
        case 'staleWhileRevalidate':
            event.respondWith(staleWhileRevalidate(request));
            break;
        case 'networkOnly':
            event.respondWith(networkOnly(request));
            break;
        case 'cacheOnly':
            event.respondWith(cacheOnly(request));
            break;
        default:
            event.respondWith(networkFirst(request));
    }
});

/**
 * Evento Message - Comunicación con la aplicación
 */
self.addEventListener('message', event => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CACHE_URLS':
            event.waitUntil(
                cacheUrls(data.urls, data.cacheName)
                    .then(() => {
                        event.ports[0].postMessage({ success: true });
                    })
                    .catch(error => {
                        event.ports[0].postMessage({ success: false, error: error.message });
                    })
            );
            break;
            
        case 'DELETE_CACHE':
            event.waitUntil(
                caches.delete(data.cacheName)
                    .then(() => {
                        event.ports[0].postMessage({ success: true });
                    })
            );
            break;
            
        case 'GET_CACHE_SIZE':
            event.waitUntil(
                getCacheSize()
                    .then(size => {
                        event.ports[0].postMessage({ size });
                    })
            );
            break;
            
        case 'CLEAR_OLD_CACHES':
            event.waitUntil(
                cleanOldCaches()
                    .then(() => {
                        event.ports[0].postMessage({ success: true });
                    })
            );
            break;
    }
});

/**
 * Evento Sync - Background Sync
 */
self.addEventListener('sync', event => {
    console.log('[SW] Background Sync event:', event.tag);
    
    switch (event.tag) {
        case 'sync-queue':
            event.waitUntil(syncQueue());
            break;
            
        case 'sync-favorites':
            event.waitUntil(syncFavorites());
            break;
            
        case 'sync-analytics':
            event.waitUntil(syncAnalytics());
            break;
            
        default:
            console.log('[SW] Unknown sync tag:', event.tag);
    }
});

/**
 * Evento Push - Notificaciones Push
 */
self.addEventListener('push', event => {
    if (!event.data) return;
    
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: '/images/icon-192.png',
        badge: '/images/badge-72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Ver ahora',
                icon: '/images/checkmark.png'
            },
            {
                action: 'close',
                title: 'Cerrar',
                icon: '/images/xmark.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ============================================
// Estrategias de Cache
// ============================================

/**
 * Cache First - Prioridad al cache
 */
async function cacheFirst(request) {
    try {
        const cached = await caches.match(request);
        
        if (cached) {
            // Actualizar en background si es necesario
            if (shouldRefreshCache(request)) {
                refreshCacheInBackground(request);
            }
            return cached;
        }
        
        const response = await fetch(request);
        
        if (response.ok) {
            const cache = await getCacheForRequest(request);
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.error('[SW] Cache First error:', error);
        return getFallbackResponse(request);
    }
}

/**
 * Network First - Prioridad a la red
 */
async function networkFirst(request, timeout = 5000) {
    try {
        const cache = await getCacheForRequest(request);
        
        // Race entre network y timeout
        const networkPromise = fetch(request);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Network timeout')), timeout)
        );
        
        try {
            const response = await Promise.race([networkPromise, timeoutPromise]);
            
            if (response.ok) {
                // Guardar en cache
                cache.put(request, response.clone());
                
                // Limpiar cache antiguo si es necesario
                await trimCache(cache, request);
            }
            
            return response;
        } catch (error) {
            // Si la red falla, intentar cache
            const cached = await caches.match(request);
            
            if (cached) {
                console.log('[SW] Network failed, serving from cache');
                return cached;
            }
            
            throw error;
        }
    } catch (error) {
        console.error('[SW] Network First error:', error);
        return getFallbackResponse(request);
    }
}

/**
 * Stale While Revalidate - Servir del cache mientras se actualiza
 */
async function staleWhileRevalidate(request) {
    try {
        const cache = await getCacheForRequest(request);
        const cached = await cache.match(request);
        
        // Fetch en background
        const fetchPromise = fetch(request).then(response => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        });
        
        // Retornar cache si existe, sino esperar al fetch
        return cached || fetchPromise;
    } catch (error) {
        console.error('[SW] Stale While Revalidate error:', error);
        return getFallbackResponse(request);
    }
}

/**
 * Network Only - Solo red
 */
async function networkOnly(request) {
    try {
        return await fetch(request);
    } catch (error) {
        console.error('[SW] Network Only error:', error);
        return getFallbackResponse(request);
    }
}

/**
 * Cache Only - Solo cache
 */
async function cacheOnly(request) {
    try {
        const cached = await caches.match(request);
        
        if (cached) {
            return cached;
        }
        
        throw new Error('No cache available');
    } catch (error) {
        console.error('[SW] Cache Only error:', error);
        return getFallbackResponse(request);
    }
}

// ============================================
// Funciones auxiliares
// ============================================

/**
 * Determinar estrategia para una petición
 */
function getStrategyForRequest(request) {
    const url = new URL(request.url);
    
    // Verificar en configuración de estrategias
    for (const [pattern, strategy] of Object.entries(CACHE_STRATEGIES)) {
        if (url.pathname.includes(pattern)) {
            return strategy;
        }
    }
    
    // Estrategias por tipo de recurso
    if (request.destination === 'image') {
        return 'cacheFirst';
    }
    
    if (request.destination === 'script' || request.destination === 'style') {
        return 'staleWhileRevalidate';
    }
    
    if (url.pathname.includes('/api/')) {
        return 'networkFirst';
    }
    
    // Por defecto
    return 'networkFirst';
}

/**
 * Obtener cache apropiado para la petición
 */
async function getCacheForRequest(request) {
    const url = new URL(request.url);
    
    if (url.pathname.includes('/api/')) {
        return caches.open(CACHES.API);
    }
    
    if (url.pathname.includes('/stream/') || request.destination === 'audio' || request.destination === 'video') {
        return caches.open(CACHES.MEDIA);
    }
    
    if (request.destination === 'image') {
        return caches.open(CACHES.IMAGES);
    }
    
    if (STATIC_RESOURCES.includes(url.pathname)) {
        return caches.open(CACHES.STATIC);
    }
    
    return caches.open(CACHES.DYNAMIC);
}

/**
 * Verificar si se debe refrescar el cache
 */
function shouldRefreshCache(request) {
    // No refrescar recursos estáticos
    const url = new URL(request.url);
    if (STATIC_RESOURCES.includes(url.pathname)) {
        return false;
    }
    
    // Refrescar APIs después de cierto tiempo
    if (url.pathname.includes('/api/')) {
        // Implementar lógica de timestamp
        return true;
    }
    
    return false;
}

/**
 * Refrescar cache en background
 */
async function refreshCacheInBackground(request) {
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            const cache = await getCacheForRequest(request);
            await cache.put(request, response);
            console.log('[SW] Cache refreshed in background:', request.url);
        }
    } catch (error) {
        // Silencioso, es background
        console.warn('[SW] Background refresh failed:', error);
    }
}

/**
 * Limpiar caches antiguos
 */
async function cleanOldCaches() {
    const cacheWhitelist = Object.values(CACHES);
    const cacheNames = await caches.keys();
    
    const deletionPromises = cacheNames
        .filter(name => name.startsWith(CACHE_PREFIX) && !cacheWhitelist.includes(name))
        .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
        });
    
    return Promise.all(deletionPromises);
}

/**
 * Limpiar cache según límites
 */
async function trimCache(cache, request) {
    const url = new URL(request.url);
    let maxItems = CACHE_LIMITS.DYNAMIC;
    
    // Determinar límite según tipo
    if (url.pathname.includes('/api/')) {
        maxItems = CACHE_LIMITS.API;
    } else if (request.destination === 'image') {
        maxItems = CACHE_LIMITS.IMAGES;
    } else if (request.destination === 'audio' || request.destination === 'video') {
        maxItems = CACHE_LIMITS.MEDIA;
    }
    
    const keys = await cache.keys();
    
    if (keys.length > maxItems) {
        const keysToDelete = keys.slice(0, keys.length - maxItems);
        
        for (const key of keysToDelete) {
            await cache.delete(key);
        }
        
        console.log(`[SW] Trimmed cache, deleted ${keysToDelete.length} items`);
    }
}

/**
 * Obtener respuesta de fallback
 */
function getFallbackResponse(request) {
    const url = new URL(request.url);
    
    // Página offline para navegación
    if (request.mode === 'navigate') {
        return caches.match('/offline.html');
    }
    
    // Placeholder para imágenes
    if (request.destination === 'image') {
        return caches.match('/images/placeholder.jpg');
    }
    
    // Respuesta JSON para APIs
    if (url.pathname.includes('/api/')) {
        return new Response(
            JSON.stringify({
                error: true,
                message: 'Offline',
                cached: false
            }),
            {
                status: 503,
                statusText: 'Service Unavailable',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store'
                }
            }
        );
    }
    
    // Respuesta genérica
    return new Response('Offline', {
        status: 503,
        statusText: 'Service Unavailable'
    });
}

/**
 * Cache URLs específicas
 */
async function cacheUrls(urls, cacheName = CACHES.DYNAMIC) {
    const cache = await caches.open(cacheName);
    const promises = urls.map(url => {
        return fetch(url)
            .then(response => {
                if (response.ok) {
                    return cache.put(url, response);
                }
            })
            .catch(error => {
                console.error(`[SW] Failed to cache ${url}:`, error);
            });
    });
    
    return Promise.all(promises);
}

/**
 * Obtener tamaño del cache
 */
async function getCacheSize() {
    if ('estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
            usage: estimate.usage || 0,
            quota: estimate.quota || 0,
            percent: ((estimate.usage || 0) / (estimate.quota || 1)) * 100
        };
    }
    
    return { usage: 0, quota: 0, percent: 0 };
}

// ============================================
// Background Sync
// ============================================

/**
 * Sincronizar cola de reproducción
 */
async function syncQueue() {
    try {
        // Obtener datos de IndexedDB
        const db = await openDB();
        const tx = db.transaction(['queue'], 'readonly');
        const store = tx.objectStore('queue');
        const queue = await store.getAll();
        
        if (queue.length > 0) {
            const response = await fetch('/api/sync/queue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ queue })
            });
            
            if (response.ok) {
                // Limpiar cola local después de sincronizar
                const clearTx = db.transaction(['queue'], 'readwrite');
                await clearTx.objectStore('queue').clear();
                console.log('[SW] Queue synced successfully');
            }
        }
    } catch (error) {
        console.error('[SW] Queue sync failed:', error);
        throw error;
    }
}

/**
 * Sincronizar favoritos
 */
async function syncFavorites() {
    try {
        const db = await openDB();
        const tx = db.transaction(['favorites'], 'readonly');
        const store = tx.objectStore('favorites');
        const favorites = await store.getAll();
        
        if (favorites.length > 0) {
            const response = await fetch('/api/sync/favorites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ favorites })
            });
            
            if (response.ok) {
                console.log('[SW] Favorites synced successfully');
            }
        }
    } catch (error) {
        console.error('[SW] Favorites sync failed:', error);
        throw error;
    }
}

/**
 * Sincronizar analytics
 */
async function syncAnalytics() {
    try {
        const db = await openDB();
        const tx = db.transaction(['analytics'], 'readonly');
        const store = tx.objectStore('analytics');
        const events = await store.getAll();
        
        if (events.length > 0) {
            const response = await fetch('/api/analytics/events', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ events })
            });
            
            if (response.ok) {
                // Limpiar eventos enviados
                const clearTx = db.transaction(['analytics'], 'readwrite');
                await clearTx.objectStore('analytics').clear();
                console.log('[SW] Analytics synced successfully');
            }
        }
    } catch (error) {
        console.error('[SW] Analytics sync failed:', error);
        throw error;
    }
}

/**
 * Abrir IndexedDB
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TVMusicApp', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Crear object stores si no existen
            if (!db.objectStoreNames.contains('queue')) {
                db.createObjectStore('queue', { keyPath: 'id' });
            }
            
            if (!db.objectStoreNames.contains('favorites')) {
                db.createObjectStore('favorites', { keyPath: 'id' });
            }
            
            if (!db.objectStoreNames.contains('analytics')) {
                db.createObjectStore('analytics', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// ============================================
// Streaming optimizado
// ============================================

/**
 * Cache de streaming adaptativo
 */
async function cacheStreamingMedia(request) {
    const cache = await caches.open(CACHES.MEDIA);
    
    try {
        // Verificar si ya está en cache
        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }
        
        // Fetch con streaming
        const response = await fetch(request);
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        
        // Clonar para cache si es pequeño
        const contentLength = response.headers.get('content-length');
        const maxSize = 50 * 1024 * 1024; // 50MB máximo para cache
        
        if (contentLength && parseInt(contentLength) < maxSize) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.error('[SW] Streaming cache error:', error);
        
        // Intentar servir desde cache si existe
        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }
        
        throw error;
    }
}

console.log('[SW] Service Worker loaded');

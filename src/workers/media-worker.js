/**
 * Media Worker para Smart TV Music App
 * Gestión de precarga y procesamiento de media en background
 */

// Estado del worker
let state = {
    preloadQueue: [],
    preloading: new Map(),
    preloaded: new Map(),
    currentPreloads: 0,
    maxConcurrent: 2,
    networkType: 'unknown',
    cacheSize: 0,
    maxCacheSize: 500 * 1024 * 1024, // 500MB
    quality: 'auto'
};

// Configuración
const CONFIG = {
    CHUNK_SIZE: 64 * 1024, // 64KB chunks
    PRELOAD_SIZE: 1024 * 1024, // Precargar primer MB
    TIMEOUT: 30000, // 30 segundos timeout
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    QUALITY_BITRATES: {
        low: 96000, // 96 kbps
        medium: 128000, // 128 kbps
        high: 256000, // 256 kbps
        lossless: 1411000 // 1411 kbps (CD quality)
    }
};

// ============================================
// Mensajes desde el main thread
// ============================================

self.addEventListener('message', async (event) => {
    const { type, data, id } = event.data;
    
    try {
        let result;
        
        switch (type) {
            case 'INIT':
                result = await initialize(data);
                break;
                
            case 'PRELOAD_TRACK':
                result = await preloadTrack(data);
                break;
                
            case 'PRELOAD_BATCH':
                result = await preloadBatch(data.tracks);
                break;
                
            case 'CANCEL_PRELOAD':
                result = cancelPreload(data.trackId);
                break;
                
            case 'CLEAR_CACHE':
                result = await clearCache();
                break;
                
            case 'GET_STATUS':
                result = getStatus();
                break;
                
            case 'SET_QUALITY':
                result = setQuality(data.quality);
                break;
                
            case 'SET_NETWORK':
                result = setNetworkInfo(data);
                break;
                
            case 'PROCESS_AUDIO':
                result = await processAudio(data);
                break;
                
            case 'ANALYZE_AUDIO':
                result = await analyzeAudio(data);
                break;
                
            case 'GENERATE_WAVEFORM':
                result = await generateWaveform(data);
                break;
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
        
        // Enviar respuesta exitosa
        self.postMessage({
            type: 'SUCCESS',
            id,
            data: result
        });
        
    } catch (error) {
        // Enviar error
        self.postMessage({
            type: 'ERROR',
            id,
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }
});

// ============================================
// Inicialización
// ============================================

/**
 * Inicializar worker
 */
async function initialize(config) {
    console.log('[MediaWorker] Initializing...');
    
    // Aplicar configuración
    if (config.maxConcurrent) {
        state.maxConcurrent = config.maxConcurrent;
    }
    
    if (config.maxCacheSize) {
        state.maxCacheSize = config.maxCacheSize;
    }
    
    if (config.quality) {
        state.quality = config.quality;
    }
    
    // Verificar cache disponible
    if ('caches' in self) {
        await checkCacheSize();
    }
    
    console.log('[MediaWorker] Initialized with config:', config);
    
    return {
        initialized: true,
        config: state
    };
}

// ============================================
// Precarga de tracks
// ============================================

/**
 * Precargar un track
 */
async function preloadTrack(track) {
    const { id, url, priority = 'normal' } = track;
    
    // Verificar si ya está precargado o en proceso
    if (state.preloaded.has(id)) {
        console.log(`[MediaWorker] Track ${id} already preloaded`);
        return { id, cached: true, fromCache: true };
    }
    
    if (state.preloading.has(id)) {
        console.log(`[MediaWorker] Track ${id} already preloading`);
        return { id, cached: false, inProgress: true };
    }
    
    // Agregar a cola según prioridad
    const queueItem = { id, url, priority, attempts: 0 };
    
    if (priority === 'high') {
        state.preloadQueue.unshift(queueItem);
    } else {
        state.preloadQueue.push(queueItem);
    }
    
    // Procesar cola
    processQueue();
    
    return { id, cached: false, queued: true };
}

/**
 * Precargar batch de tracks
 */
async function preloadBatch(tracks) {
    const results = [];
    
    for (const track of tracks) {
        const result = await preloadTrack(track);
        results.push(result);
    }
    
    return results;
}

/**
 * Procesar cola de precarga
 */
async function processQueue() {
    // Verificar límite concurrente
    if (state.currentPreloads >= state.maxConcurrent) {
        return;
    }
    
    // Verificar si hay items en cola
    if (state.preloadQueue.length === 0) {
        return;
    }
    
    // Tomar siguiente item
    const item = state.preloadQueue.shift();
    
    // Incrementar contador
    state.currentPreloads++;
    
    // Marcar como en proceso
    state.preloading.set(item.id, {
        startTime: Date.now(),
        progress: 0,
        controller: new AbortController()
    });
    
    try {
        // Realizar precarga
        const result = await fetchAndCache(item);
        
        // Marcar como completado
        state.preloaded.set(item.id, {
            url: item.url,
            size: result.size,
            duration: result.duration,
            timestamp: Date.now()
        });
        
        // Notificar completado
        notifyPreloadComplete(item.id, result);
        
    } catch (error) {
        console.error(`[MediaWorker] Preload failed for ${item.id}:`, error);
        
        // Reintentar si quedan intentos
        if (item.attempts < CONFIG.RETRY_ATTEMPTS) {
            item.attempts++;
            
            // Reencolar con delay
            setTimeout(() => {
                state.preloadQueue.push(item);
                processQueue();
            }, CONFIG.RETRY_DELAY * item.attempts);
        } else {
            // Notificar fallo
            notifyPreloadFailed(item.id, error);
        }
    } finally {
        // Limpiar estado
        state.preloading.delete(item.id);
        state.currentPreloads--;
        
        // Procesar siguiente
        processQueue();
    }
}

/**
 * Fetch y cache de media
 */
async function fetchAndCache(item) {
    const { id, url } = item;
    const preloadInfo = state.preloading.get(id);
    
    try {
        // Determinar calidad según red
        const quality = determineQuality();
        const finalUrl = `${url}?quality=${quality}`;
        
        // Fetch con timeout y abort controller
        const response = await fetchWithTimeout(finalUrl, {
            signal: preloadInfo.controller.signal,
            headers: {
                'Range': `bytes=0-${CONFIG.PRELOAD_SIZE - 1}` // Precargar solo el inicio
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Obtener información del contenido
        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type');
        
        // Leer y cache el contenido
        const buffer = await response.arrayBuffer();
        
        // Guardar en cache si está disponible
        if ('caches' in self) {
            const cache = await caches.open('media-cache');
            await cache.put(new Request(finalUrl), new Response(buffer, {
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': contentLength,
                    'X-Preloaded': 'true',
                    'X-Preload-Time': new Date().toISOString()
                }
            }));
        }
        
        // Analizar metadata si es posible
        let duration = 0;
        if (contentType && contentType.includes('audio')) {
            duration = await estimateDuration(buffer, contentType);
        }
        
        return {
            size: buffer.byteLength,
            duration,
            contentType,
            quality
        };
        
    } catch (error) {
        // Si fue cancelado, no es un error
        if (error.name === 'AbortError') {
            console.log(`[MediaWorker] Preload cancelled for ${id}`);
            return null;
        }
        
        throw error;
    }
}

/**
 * Fetch con timeout
 */
async function fetchWithTimeout(url, options = {}) {
    const timeout = options.timeout || CONFIG.TIMEOUT;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: options.signal || controller.signal
        });
        
        clearTimeout(timeoutId);
        return response;
        
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

/**
 * Cancelar precarga
 */
function cancelPreload(trackId) {
    // Remover de cola
    state.preloadQueue = state.preloadQueue.filter(item => item.id !== trackId);
    
    // Cancelar si está en proceso
    const preloadInfo = state.preloading.get(trackId);
    if (preloadInfo) {
        preloadInfo.controller.abort();
        state.preloading.delete(trackId);
        state.currentPreloads--;
        
        // Procesar siguiente
        processQueue();
    }
    
    return { cancelled: true };
}

// ============================================
// Procesamiento de audio
// ============================================

/**
 * Procesar audio (normalización, compresión, etc.)
 */
async function processAudio(data) {
    const { buffer, processing } = data;
    
    // Simular procesamiento
    // En una implementación real, aquí se usaría Web Audio API
    
    const processed = {
        buffer,
        normalized: processing.normalize || false,
        compressed: processing.compress || false,
        equalized: processing.equalize || false
    };
    
    // Aplicar procesamiento básico
    if (processing.normalize) {
        // Normalizar volumen
        processed.buffer = normalizeAudio(buffer);
    }
    
    if (processing.compress) {
        // Comprimir dinámicamente
        processed.buffer = compressAudio(buffer);
    }
    
    return processed;
}

/**
 * Analizar audio (BPM, key, etc.)
 */
async function analyzeAudio(data) {
    const { buffer, analysisType } = data;
    
    const analysis = {
        duration: 0,
        bitrate: 0,
        sampleRate: 0,
        channels: 0
    };
    
    // Análisis básico
    if (buffer && buffer.byteLength > 0) {
        // Estimar duración basada en tamaño y bitrate asumido
        const assumedBitrate = 128000; // 128 kbps
        analysis.duration = (buffer.byteLength * 8) / assumedBitrate;
        analysis.bitrate = assumedBitrate;
    }
    
    // Análisis específicos
    if (analysisType.includes('bpm')) {
        analysis.bpm = await detectBPM(buffer);
    }
    
    if (analysisType.includes('key')) {
        analysis.key = await detectKey(buffer);
    }
    
    if (analysisType.includes('peaks')) {
        analysis.peaks = await detectPeaks(buffer);
    }
    
    return analysis;
}

/**
 * Generar waveform
 */
async function generateWaveform(data) {
    const { buffer, width = 1000, height = 100 } = data;
    
    // Generar datos de waveform
    const samples = Math.floor(buffer.byteLength / width);
    const waveform = [];
    
    const dataView = new DataView(buffer);
    
    for (let i = 0; i < width; i++) {
        let sum = 0;
        let count = 0;
        
        for (let j = 0; j < samples; j++) {
            const index = i * samples + j;
            
            if (index * 2 < dataView.byteLength) {
                const value = Math.abs(dataView.getInt16(index * 2, true) / 32768);
                sum += value;
                count++;
            }
        }
        
        const average = count > 0 ? sum / count : 0;
        waveform.push(Math.floor(average * height));
    }
    
    return {
        waveform,
        width,
        height,
        samples: buffer.byteLength / 2,
        duration: estimateDuration(buffer)
    };
}

// ============================================
// Funciones auxiliares
// ============================================

/**
 * Determinar calidad según red
 */
function determineQuality() {
    if (state.quality !== 'auto') {
        return state.quality;
    }
    
    switch (state.networkType) {
        case '4g':
        case 'wifi':
            return 'high';
        case '3g':
            return 'medium';
        case '2g':
        case 'slow-2g':
            return 'low';
        default:
            return 'medium';
    }
}

/**
 * Estimar duración del audio
 */
async function estimateDuration(buffer, contentType) {
    // Estimación básica basada en tamaño y bitrate
    const bitrate = CONFIG.QUALITY_BITRATES[state.quality] || CONFIG.QUALITY_BITRATES.medium;
    const duration = (buffer.byteLength * 8) / bitrate;
    
    return duration;
}

/**
 * Normalizar audio
 */
function normalizeAudio(buffer) {
    // Implementación básica de normalización
    const dataView = new DataView(buffer);
    const normalized = new ArrayBuffer(buffer.byteLength);
    const normalizedView = new DataView(normalized);
    
    // Encontrar pico máximo
    let maxPeak = 0;
    for (let i = 0; i < dataView.byteLength / 2; i++) {
        const sample = Math.abs(dataView.getInt16(i * 2, true));
        if (sample > maxPeak) {
            maxPeak = sample;
        }
    }
    
    // Normalizar
    const scale = maxPeak > 0 ? 32767 / maxPeak : 1;
    
    for (let i = 0; i < dataView.byteLength / 2; i++) {
        const sample = dataView.getInt16(i * 2, true);
        const normalized = Math.floor(sample * scale);
        normalizedView.setInt16(i * 2, normalized, true);
    }
    
    return normalized;
}

/**
 * Comprimir audio dinámicamente
 */
function compressAudio(buffer) {
    // Implementación básica de compresión dinámica
    // En producción, usar Web Audio API
    return buffer;
}

/**
 * Detectar BPM
 */
async function detectBPM(buffer) {
    // Implementación simplificada
    // En producción, usar algoritmos como autocorrelación
    return 120; // BPM por defecto
}

/**
 * Detectar key musical
 */
async function detectKey(buffer) {
    // Implementación simplificada
    // En producción, usar FFT y análisis armónico
    return 'C major';
}

/**
 * Detectar picos
 */
async function detectPeaks(buffer) {
    const peaks = [];
    const dataView = new DataView(buffer);
    const sampleRate = 44100; // Asumido
    const samplesPerPeak = Math.floor(sampleRate / 10); // 10 picos por segundo
    
    for (let i = 0; i < dataView.byteLength / 2; i += samplesPerPeak) {
        let maxPeak = 0;
        
        for (let j = 0; j < samplesPerPeak && (i + j) * 2 < dataView.byteLength; j++) {
            const sample = Math.abs(dataView.getInt16((i + j) * 2, true));
            if (sample > maxPeak) {
                maxPeak = sample;
            }
        }
        
        peaks.push(maxPeak / 32768); // Normalizar a 0-1
    }
    
    return peaks;
}

/**
 * Verificar tamaño de cache
 */
async function checkCacheSize() {
    if ('estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        state.cacheSize = estimate.usage || 0;
        
        // Limpiar si excede el límite
        if (state.cacheSize > state.maxCacheSize) {
            await cleanupOldCache();
        }
    }
}

/**
 * Limpiar cache antiguo
 */
async function cleanupOldCache() {
    const cache = await caches.open('media-cache');
    const requests = await cache.keys();
    
    // Ordenar por antigüedad (si tenemos metadata)
    // Por ahora, eliminar los primeros 25%
    const toDelete = Math.floor(requests.length * 0.25);
    
    for (let i = 0; i < toDelete; i++) {
        await cache.delete(requests[i]);
    }
    
    console.log(`[MediaWorker] Cleaned ${toDelete} items from cache`);
}

/**
 * Limpiar todo el cache
 */
async function clearCache() {
    state.preloaded.clear();
    state.preloading.clear();
    state.preloadQueue = [];
    
    if ('caches' in self) {
        await caches.delete('media-cache');
    }
    
    return { cleared: true };
}

/**
 * Establecer calidad
 */
function setQuality(quality) {
    state.quality = quality;
    return { quality: state.quality };
}

/**
 * Establecer información de red
 */
function setNetworkInfo(info) {
    state.networkType = info.type || 'unknown';
    
    // Ajustar configuración según red
    if (state.networkType === '2g' || state.networkType === 'slow-2g') {
        state.maxConcurrent = 1;
    } else if (state.networkType === '3g') {
        state.maxConcurrent = 2;
    } else {
        state.maxConcurrent = 3;
    }
    
    return { networkType: state.networkType, maxConcurrent: state.maxConcurrent };
}

/**
 * Obtener estado actual
 */
function getStatus() {
    return {
        queueLength: state.preloadQueue.length,
        preloading: state.preloading.size,
        preloaded: state.preloaded.size,
        currentPreloads: state.currentPreloads,
        maxConcurrent: state.maxConcurrent,
        cacheSize: state.cacheSize,
        maxCacheSize: state.maxCacheSize,
        networkType: state.networkType,
        quality: state.quality
    };
}

// ============================================
// Notificaciones
// ============================================

/**
 * Notificar precarga completada
 */
function notifyPreloadComplete(trackId, result) {
    self.postMessage({
        type: 'PRELOAD_COMPLETE',
        data: {
            trackId,
            ...result
        }
    });
}

/**
 * Notificar fallo en precarga
 */
function notifyPreloadFailed(trackId, error) {
    self.postMessage({
        type: 'PRELOAD_FAILED',
        data: {
            trackId,
            error: error.message
        }
    });
}

/**
 * Notificar progreso
 */
function notifyProgress(trackId, progress) {
    self.postMessage({
        type: 'PRELOAD_PROGRESS',
        data: {
            trackId,
            progress
        }
    });
}

console.log('[MediaWorker] Worker loaded and ready');

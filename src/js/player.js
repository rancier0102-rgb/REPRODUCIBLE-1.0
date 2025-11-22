
/**
 * Music Player optimizado para Smart TV
 * Gestiona reproducción, cola, y streaming adaptativo
 */

class MusicPlayer {
    constructor(app) {
        this.app = app;
        this.audio = null;
        this.currentTrack = null;
        this.queue = [];
        this.queueIndex = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.volume = 1.0;
        this.repeat = 'none'; // none, one, all
        this.shuffle = false;
        this.crossfade = false;
        this.crossfadeDuration = 3000;
        
        // Buffer y streaming
        this.bufferSize = 64 * 1024; // 64KB
        this.preloadNext = true;
        this.nextAudio = null;
        
        // Estados
        this.state = 'idle'; // idle, loading, playing, paused, error
        this.events = {};
    }

    /**
     * Configurar reproductor
     */
    async setup() {
        // Crear elementos de audio
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.volume = this.volume;
        
        // Configurar eventos
        this.setupEventListeners();
        
        // Restaurar sesión si existe
        await this.restoreSession();
        
        // Inicializar visualizador si está disponible
        if (window.AudioContext) {
            this.setupAudioContext();
        }
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Eventos de reproducción
        this.audio.addEventListener('play', () => this.handlePlay());
        this.audio.addEventListener('pause', () => this.handlePause());
        this.audio.addEventListener('ended', () => this.handleEnded());
        this.audio.addEventListener('error', (e) => this.handleError(e));
        
        // Eventos de carga
        this.audio.addEventListener('loadstart', () => this.handleLoadStart());
        this.audio.addEventListener('canplay', () => this.handleCanPlay());
        this.audio.addEventListener('progress', () => this.handleProgress());
        
        // Eventos de tiempo
        this.audio.addEventListener('timeupdate', () => this.handleTimeUpdate());
        this.audio.addEventListener('durationchange', () => this.handleDurationChange());
        
        // Control de volumen
        this.audio.addEventListener('volumechange', () => this.handleVolumeChange());
    }

    /**
     * Configurar AudioContext para visualización y efectos
     */
    setupAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            
            this.source = this.audioContext.createMediaElementSource(this.audio);
            this.gainNode = this.audioContext.createGain();
            
            this.source.connect(this.analyser);
            this.analyser.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            // Iniciar visualizador
            this.startVisualizer();
            
        } catch (error) {
            console.warn('AudioContext not available:', error);
        }
    }

    /**
     * Reproducir pista
     */
    async play(track) {
        try {
            this.setState('loading');
            
            if (track) {
                // Nueva pista
                this.currentTrack = track;
                await this.loadTrack(track);
            }
            
            // Reanudar contexto de audio si está suspendido
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Reproducir
            await this.audio.play();
            this.isPlaying = true;
            this.isPaused = false;
            
            // Precargar siguiente si está habilitado
            if (this.preloadNext && this.hasNext()) {
                this.preloadNextTrack();
            }
            
            this.setState('playing');
            this.emit('play', this.currentTrack);
            
        } catch (error) {
            console.error('Error playing track:', error);
            this.handleError(error);
        }
    }

    /**
     * Pausar reproducción
     */
    pause() {
        if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
            this.isPaused = true;
            this.setState('paused');
            this.emit('pause');
        }
    }

    /**
     * Detener reproducción
     */
    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.setState('idle');
        this.emit('stop');
    }

    /**
     * Alternar reproducción/pausa
     */
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Cargar pista
     */
    async loadTrack(track) {
        return new Promise((resolve, reject) => {
            // Limpiar source anterior
            if (this.audio.src) {
                URL.revokeObjectURL(this.audio.src);
            }
            
            // Configurar nueva source
            this.audio.src = this.getStreamUrl(track);
            
            // Esperar a que se pueda reproducir
            const canPlayHandler = () => {
                this.audio.removeEventListener('canplay', canPlayHandler);
                this.audio.removeEventListener('error', errorHandler);
                resolve();
            };
            
            const errorHandler = (error) => {
                this.audio.removeEventListener('canplay', canPlayHandler);
                this.audio.removeEventListener('error', errorHandler);
                reject(error);
            };
            
            this.audio.addEventListener('canplay', canPlayHandler);
            this.audio.addEventListener('error', errorHandler);
            
            // Cargar
            this.audio.load();
        });
    }

    /**
     * Obtener URL de streaming optimizada
     */
    getStreamUrl(track) {
        // Detectar capacidades del dispositivo
        const quality = this.getOptimalQuality();
        
        // Construir URL con parámetros
        const params = new URLSearchParams({
            id: track.id,
            quality: quality,
            format: this.getSupportedFormat()
        });
        
        return `/api/stream?${params.toString()}`;
    }

    /**
     * Determinar calidad óptima basada en conexión
     */
    getOptimalQuality() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            const effectiveType = connection.effectiveType;
            
            switch (effectiveType) {
                case '4g': return 'high';
                case '3g': return 'medium';
                case '2g': return 'low';
                default: return 'medium';
            }
        }
        
        return 'high'; // Por defecto alta calidad
    }

    /**
     * Obtener formato soportado
     */
    getSupportedFormat() {
        const audio = document.createElement('audio');
        
        if (audio.canPlayType('audio/opus')) return 'opus';
        if (audio.canPlayType('audio/webm')) return 'webm';
        if (audio.canPlayType('audio/mp4')) return 'm4a';
        if (audio.canPlayType('audio/mpeg')) return 'mp3';
        
        return 'mp3'; // Fallback
    }

    /**
     * Siguiente pista
     */
    async next() {
        if (this.hasNext()) {
            this.queueIndex++;
            
            // Si hay crossfade y siguiente precargada
            if (this.crossfade && this.nextAudio && this.nextAudio.readyState >= 3) {
                await this.crossfadeToNext();
            } else {
                await this.play(this.queue[this.queueIndex]);
            }
            
            this.emit('next', this.currentTrack);
        } else if (this.repeat === 'all') {
            // Volver al inicio de la cola
            this.queueIndex = 0;
            await this.play(this.queue[0]);
        }
    }

    /**
     * Pista anterior
     */
    async previous() {
        // Si han pasado más de 3 segundos, reiniciar pista actual
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
        } else if (this.hasPrevious()) {
            this.queueIndex--;
            await this.play(this.queue[this.queueIndex]);
            this.emit('previous', this.currentTrack);
        }
    }

    /**
     * Verificar si hay siguiente pista
     */
    hasNext() {
        return this.queueIndex < this.queue.length - 1;
    }

    /**
     * Verificar si hay pista anterior
     */
    hasPrevious() {
        return this.queueIndex > 0;
    }

    /**
     * Precargar siguiente pista
     */
    async preloadNextTrack() {
        if (!this.hasNext()) return;
        
        const nextTrack = this.queue[this.queueIndex + 1];
        
        // Crear audio para precarga
        if (!this.nextAudio) {
            this.nextAudio = new Audio();
        }
        
        this.nextAudio.src = this.getStreamUrl(nextTrack);
        this.nextAudio.preload = 'auto';
        this.nextAudio.volume = 0; // Silencioso mientras precarga
    }

    /**
     * Crossfade a siguiente pista
     */
    async crossfadeToNext() {
        return new Promise((resolve) => {
            const fadeOutInterval = setInterval(() => {
                if (this.audio.volume > 0.01) {
                    this.audio.volume -= 0.01;
                } else {
                    clearInterval(fadeOutInterval);
                    
                    // Cambiar audios
                    const oldAudio = this.audio;
                    this.audio = this.nextAudio;
                    this.nextAudio = oldAudio;
                    
                    // Fade in
                    this.audio.volume = 0;
                    this.audio.play();
                    
                    const fadeInInterval = setInterval(() => {
                        if (this.audio.volume < this.volume - 0.01) {
                            this.audio.volume += 0.01;
                        } else {
                            this.audio.volume = this.volume;
                            clearInterval(fadeInInterval);
                            resolve();
                        }
                    }, this.crossfadeDuration / 100);
                }
            }, this.crossfadeDuration / 100);
        });
    }

    /**
     * Agregar a la cola
     */
    addToQueue(tracks, position = 'end') {
        const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
        
        if (position === 'next') {
            // Agregar después de la pista actual
            this.queue.splice(this.queueIndex + 1, 0, ...tracksArray);
        } else {
            // Agregar al final
            this.queue.push(...tracksArray);
        }
        
        this.emit('queueUpdate', this.queue);
    }

    /**
     * Limpiar cola
     */
    clearQueue() {
        this.queue = [];
        this.queueIndex = 0;
        this.emit('queueClear');
    }

    /**
     * Reproducir cola
     */
    async playQueue(queue, startIndex = 0) {
        this.queue = queue;
        this.queueIndex = startIndex;
        
        if (this.queue.length > 0) {
            await this.play(this.queue[this.queueIndex]);
        }
    }

    /**
     * Mezclar cola
     */
    shuffleQueue() {
        if (this.queue.length <= 1) return;
        
        // Guardar pista actual
        const currentTrack = this.queue[this.queueIndex];
        
        // Mezclar array
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        
        // Encontrar nueva posición de pista actual
        this.queueIndex = this.queue.indexOf(currentTrack);
        
        this.emit('queueShuffle', this.queue);
    }

    /**
     * Buscar en posición
     */
    seek(time) {
        if (!isNaN(time) && isFinite(time)) {
            this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration));
            this.emit('seek', this.audio.currentTime);
        }
    }

    /**
     * Buscar por porcentaje
     */
    seekPercentage(percentage) {
        if (this.audio.duration) {
            const time = (percentage / 100) * this.audio.duration;
            this.seek(time);
        }
    }

    /**
     * Establecer volumen
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.audio.volume = this.volume;
        
        if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
        
        this.emit('volumeChange', this.volume);
    }

    /**
     * Establecer modo de repetición
     */
    setRepeat(mode) {
        this.repeat = mode; // none, one, all
        this.emit('repeatChange', mode);
    }

    /**
     * Alternar shuffle
     */
    toggleShuffle() {
        this.shuffle = !this.shuffle;
        
        if (this.shuffle) {
            this.shuffleQueue();
        }
        
        this.emit('shuffleChange', this.shuffle);
    }

    /**
     * Manejadores de eventos
     */
    handlePlay() {
        this.isPlaying = true;
        this.isPaused = false;
        this.setState('playing');
    }

    handlePause() {
        this.isPlaying = false;
        this.isPaused = true;
        this.setState('paused');
    }

    async handleEnded() {
        if (this.repeat === 'one') {
            // Repetir pista actual
            this.audio.currentTime = 0;
            await this.play();
        } else if (this.hasNext() || this.repeat === 'all') {
            // Siguiente pista
            await this.next();
        } else {
            // Fin de la reproducción
            this.stop();
            this.emit('queueEnd');
        }
    }

    handleError(error) {
        console.error('Player error:', error);
        this.setState('error');
        this.emit('error', error);
        
        // Intentar recuperar
        if (this.hasNext()) {
            setTimeout(() => this.next(), 1000);
        }
    }

    handleLoadStart() {
        this.setState('loading');
        this.emit('loadstart');
    }

    handleCanPlay() {
        this.emit('canplay');
    }

    handleProgress() {
        if (this.audio.buffered.length > 0) {
            const buffered = this.audio.buffered.end(0);
            const duration = this.audio.duration;
            
            if (duration > 0) {
                const percentage = (buffered / duration) * 100;
                this.emit('buffer', percentage);
            }
        }
    }

    handleTimeUpdate() {
        const currentTime = this.audio.currentTime;
        const duration = this.audio.duration;
        
        if (!isNaN(duration) && duration > 0) {
            const percentage = (currentTime / duration) * 100;
            this.emit('timeupdate', {
                currentTime,
                duration,
                percentage
            });
        }
    }

    handleDurationChange() {
        this.emit('durationchange', this.audio.duration);
    }

    handleVolumeChange() {
        this.emit('volumechange', this.audio.volume);
    }

    /**
     * Visualizador de audio
     */
    startVisualizer() {
        if (!this.analyser) return;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            requestAnimationFrame(draw);
            
            this.analyser.getByteFrequencyData(dataArray);
            this.emit('visualizer', dataArray);
        };
        
        draw();
    }

    /**
     * Guardar sesión
     */
    saveSession() {
        const session = {
            track: this.currentTrack,
            queue: this.queue,
            queueIndex: this.queueIndex,
            currentTime: this.audio.currentTime,
            volume: this.volume,
            repeat: this.repeat,
            shuffle: this.shuffle
        };
        
        localStorage.setItem('playerSession', JSON.stringify(session));
    }

    /**
     * Restaurar sesión
     */
    async restoreSession() {
        try {
            const sessionData = localStorage.getItem('playerSession');
            if (!sessionData) return;
            
            const session = JSON.parse(sessionData);
            
            this.queue = session.queue || [];
            this.queueIndex = session.queueIndex || 0;
            this.volume = session.volume || 1.0;
            this.repeat = session.repeat || 'none';
            this.shuffle = session.shuffle || false;
            
            if (session.track && this.queue.length > 0) {
                this.currentTrack = session.track;
                await this.loadTrack(this.currentTrack);
                
                if (session.currentTime) {
                    this.audio.currentTime = session.currentTime;
                }
            }
            
        } catch (error) {
            console.error('Error restoring session:', error);
        }
    }

    /**
     * Sistema de eventos
     */
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback(data));
        }
    }

    /**
     * Establecer estado
     */
    setState(state) {
        this.state = state;
        this.emit('stateChange', state);
    }

    /**
     * Obtener información actual
     */
    getCurrentInfo() {
        return {
            track: this.currentTrack,
            state: this.state,
            currentTime: this.audio.currentTime,
            duration: this.audio.duration,
            volume: this.volume,
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            queue: this.queue,
            queueIndex: this.queueIndex,
            repeat: this.repeat,
            shuffle: this.shuffle
        };
    }
}

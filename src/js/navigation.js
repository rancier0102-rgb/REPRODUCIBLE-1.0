/**
 * TV Navigation Controller
 * Gestión completa de navegación con control remoto
 */

class TVNavigation {
    constructor(app) {
        this.app = app;
        this.enabled = true;
        this.currentFocus = null;
        this.focusableElements = [];
        this.navigationStack = [];
        this.zones = new Map();
        this.currentZone = 'main';
        
        // Configuración
        this.config = {
            scrollSpeed: 300,
            focusClass: 'focused',
            selectClass: 'selected',
            zoneClass: 'nav-zone',
            focusableSelector: '[data-focusable="true"]:not([disabled])',
            autoFocus: true,
            wrapNavigation: false,
            soundEnabled: true,
            hapticEnabled: true
        };
        
        // Mapeo de teclas
        this.keyMap = {
            37: 'left',    // Arrow Left
            38: 'up',      // Arrow Up
            39: 'right',   // Arrow Right
            40: 'down',    // Arrow Down
            13: 'enter',   // Enter
            27: 'back',    // Escape
            8: 'back',     // Backspace
            32: 'enter',   // Space
            
            // Teclas multimedia
            415: 'play',   // Media Play
            19: 'pause',   // Media Pause
            413: 'stop',   // Media Stop
            417: 'ff',     // Fast Forward
            412: 'rw',     // Rewind
            
            // Teclas de color (control remoto)
            403: 'red',
            404: 'green',
            405: 'yellow',
            406: 'blue',
            
            // Teclas numéricas
            48: '0', 49: '1', 50: '2', 51: '3', 52: '4',
            53: '5', 54: '6', 55: '7', 56: '8', 57: '9'
        };
        
        this.events = {};
    }

    /**
     * Inicializar navegación
     */
    async init() {
        // Configurar event listeners
        this.setupEventListeners();
        
        // Detectar zonas de navegación
        this.detectZones();
        
        // Actualizar elementos focusables
        this.updateFocusableElements();
        
        // Establecer foco inicial
        if (this.config.autoFocus) {
            this.setInitialFocus();
        }
        
        // Cargar sonidos si están habilitados
        if (this.config.soundEnabled) {
            await this.loadSounds();
        }
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Eventos de teclado
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Eventos de mouse (para desarrollo)
        document.addEventListener('mouseover', (e) => this.handleMouseOver(e));
        document.addEventListener('click', (e) => this.handleClick(e));
        
        // Eventos de gamepad
        if ('GamepadEvent' in window) {
            window.addEventListener('gamepadconnected', (e) => this.handleGamepadConnected(e));
            window.addEventListener('gamepaddisconnected', (e) => this.handleGamepadDisconnected(e));
        }
        
        // Observar cambios en el DOM
        this.setupMutationObserver();
    }

    /**
     * Configurar MutationObserver para detectar cambios
     */
    setupMutationObserver() {
        this.observer = new MutationObserver(() => {
            this.updateFocusableElements();
        });
        
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-focusable', 'disabled']
        });
    }

    /**
     * Detectar zonas de navegación
     */
    detectZones() {
        const zones = document.querySelectorAll(`.${this.config.zoneClass}`);
        
        zones.forEach(zone => {
            const zoneName = zone.dataset.zone || zone.id;
            if (zoneName) {
                this.zones.set(zoneName, {
                    element: zone,
                    focusables: [],
                    defaultFocus: zone.dataset.defaultFocus
                });
            }
        });
    }

    /**
     * Actualizar elementos focusables
     */
    updateFocusableElements() {
        // Actualizar lista global
        this.focusableElements = Array.from(
            document.querySelectorAll(this.config.focusableSelector)
        );
        
        // Actualizar por zonas
        this.zones.forEach((zone, zoneName) => {
            zone.focusables = Array.from(
                zone.element.querySelectorAll(this.config.focusableSelector)
            );
        });
        
        // Verificar si el elemento actual sigue siendo focusable
        if (this.currentFocus && !this.focusableElements.includes(this.currentFocus)) {
            this.setInitialFocus();
        }
    }

    /**
     * Establecer foco inicial
     */
    setInitialFocus() {
        const zone = this.zones.get(this.currentZone);
        
        if (zone && zone.defaultFocus) {
            const defaultElement = document.getElementById(zone.defaultFocus);
            if (defaultElement && this.isFocusable(defaultElement)) {
                this.setFocus(defaultElement);
                return;
            }
        }
        
        // Buscar primer elemento focusable
        const firstFocusable = this.focusableElements[0];
        if (firstFocusable) {
            this.setFocus(firstFocusable);
        }
    }

    /**
     * Manejar keydown
     */
    handleKeyDown(event) {
        if (!this.enabled) return;
        
        const key = this.keyMap[event.keyCode];
        if (!key) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        switch (key) {
            case 'up':
            case 'down':
            case 'left':
            case 'right':
                this.navigate(key);
                break;
                
            case 'enter':
                this.select();
                break;
                
            case 'back':
                this.back();
                break;
                
            // Teclas multimedia
            case 'play':
                this.app.modules.player.play();
                break;
            case 'pause':
                this.app.modules.player.pause();
                break;
            case 'stop':
                this.app.modules.player.stop();
                break;
            case 'ff':
                this.app.modules.player.seek(10);
                break;
            case 'rw':
                this.app.modules.player.seek(-10);
                break;
                
            // Teclas de color
            case 'red':
            case 'green':
            case 'yellow':
            case 'blue':
                this.handleColorKey(key);
                break;
                
            // Teclas numéricas
            default:
                if (key >= '0' && key <= '9') {
                    this.handleNumericKey(key);
                }
        }
        
        this.emit('keydown', { key, event });
    }

    /**
     * Navegar en dirección
     */
    navigate(direction) {
        if (!this.currentFocus) {
            this.setInitialFocus();
            return;
        }
        
        const nextElement = this.findNextElement(direction);
        
        if (nextElement) {
            this.setFocus(nextElement);
            this.playNavigationSound();
        } else if (this.config.wrapNavigation) {
            // Envolver navegación
            this.wrapNavigation(direction);
        }
    }

    /**
     * Encontrar siguiente elemento en dirección
     */
    findNextElement(direction) {
        const candidates = this.getCandidates(direction);
        
        if (candidates.length === 0) return null;
        
        // Ordenar por distancia y alineación
        candidates.sort((a, b) => {
            const scoreA = this.calculateScore(a, direction);
            const scoreB = this.calculateScore(b, direction);
            return scoreA - scoreB;
        });
        
        return candidates[0].element;
    }

    /**
     * Obtener candidatos en dirección
     */
    getCandidates(direction) {
        const currentRect = this.currentFocus.getBoundingClientRect();
        const candidates = [];
        
        this.focusableElements.forEach(element => {
            if (element === this.currentFocus) return;
            
            const rect = element.getBoundingClientRect();
            
            if (this.isInDirection(currentRect, rect, direction)) {
                candidates.push({
                    element,
                    rect,
                    distance: this.calculateDistance(currentRect, rect),
                    alignment: this.calculateAlignment(currentRect, rect, direction)
                });
            }
        });
        
        return candidates;
    }

    /**
     * Verificar si elemento está en dirección
     */
    isInDirection(from, to, direction) {
        const threshold = 30; // Pixels de tolerancia
        
        switch (direction) {
            case 'up':
                return to.bottom <= from.top + threshold;
                
            case 'down':
                return to.top >= from.bottom - threshold;
                
            case 'left':
                return to.right <= from.left + threshold;
                
            case 'right':
                return to.left >= from.right - threshold;
                
            default:
                return false;
        }
    }

    /**
     * Calcular distancia entre elementos
     */
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

    /**
     * Calcular alineación
     */
    calculateAlignment(rect1, rect2, direction) {
        if (direction === 'up' || direction === 'down') {
            // Alineación horizontal
            const center1 = rect1.left + rect1.width / 2;
            const center2 = rect2.left + rect2.width / 2;
            return Math.abs(center1 - center2);
        } else {
            // Alineación vertical
            const center1 = rect1.top + rect1.height / 2;
            const center2 = rect2.top + rect2.height / 2;
            return Math.abs(center1 - center2);
        }
    }

    /**
     * Calcular puntuación para ordenar candidatos
     */
    calculateScore(candidate, direction) {
        // Menor puntuación = mejor candidato
        const distanceWeight = 1.0;
        const alignmentWeight = 0.5;
        
        return (candidate.distance * distanceWeight) + 
               (candidate.alignment * alignmentWeight);
    }

    /**
     * Establecer foco en elemento
     */
    setFocus(element, options = {}) {
        if (!element || !this.isFocusable(element)) return;
        
        // Quitar foco anterior
        if (this.currentFocus) {
            this.currentFocus.classList.remove(this.config.focusClass);
            this.currentFocus.setAttribute('tabindex', '-1');
        }
        
        // Establecer nuevo foco
        this.currentFocus = element;
        element.classList.add(this.config.focusClass);
        element.setAttribute('tabindex', '0');
        element.focus();
        
        // Asegurar visibilidad
        this.ensureVisible(element);
        
        // Actualizar zona actual
        this.updateCurrentZone(element);
        
        // Emitir evento
        this.emit('focus', element);
        
        // Vibración háptica si está disponible
        if (this.config.hapticEnabled && 'vibrate' in navigator) {
            navigator.vibrate(10);
        }
    }

    /**
     * Asegurar que elemento sea visible
     */
    ensureVisible(element) {
        const rect = element.getBoundingClientRect();
        const container = element.closest('.scrollable') || document.documentElement;
        const containerRect = container.getBoundingClientRect();
        
        // Verificar visibilidad vertical
        if (rect.top < containerRect.top) {
            // Scroll hacia arriba
            const scrollTop = container.scrollTop + (rect.top - containerRect.top) - 50;
            this.smoothScroll(container, scrollTop);
        } else if (rect.bottom > containerRect.bottom) {
            // Scroll hacia abajo
            const scrollTop = container.scrollTop + (rect.bottom - containerRect.bottom) + 50;
            this.smoothScroll(container, scrollTop);
        }
        
        // Verificar visibilidad horizontal
        if (rect.left < containerRect.left) {
            // Scroll hacia izquierda
            const scrollLeft = container.scrollLeft + (rect.left - containerRect.left) - 50;
            this.smoothScroll(container, null, scrollLeft);
        } else if (rect.right > containerRect.right) {
            // Scroll hacia derecha
            const scrollLeft = container.scrollLeft + (rect.right - containerRect.right) + 50;
            this.smoothScroll(container, null, scrollLeft);
        }
    }

    /**
     * Smooth scroll
     */
    smoothScroll(container, top = null, left = null) {
        const options = {
            behavior: 'smooth'
        };
        
        if (top !== null) options.top = top;
        if (left !== null) options.left = left;
        
        container.scrollTo(options);
    }

    /**
     * Actualizar zona actual
     */
    updateCurrentZone(element) {
        for (const [zoneName, zone] of this.zones) {
            if (zone.element.contains(element)) {
                this.currentZone = zoneName;
                break;
            }
        }
    }

    /**
     * Seleccionar elemento actual
     */
    select() {
        if (!this.currentFocus) return;
        
        // Agregar clase de selección temporalmente
        this.currentFocus.classList.add(this.config.selectClass);
        setTimeout(() => {
            this.currentFocus.classList.remove(this.config.selectClass);
        }, 200);
        
        // Reproducir sonido
        this.playSelectSound();
        
        // Simular click
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        
        this.currentFocus.dispatchEvent(clickEvent);
        
        // Emitir evento
        this.emit('select', this.currentFocus);
    }

    /**
     * Navegar hacia atrás
     */
    back() {
        // Verificar si hay stack de navegación
        if (this.navigationStack.length > 0) {
            const previousFocus = this.navigationStack.pop();
            this.setFocus(previousFocus);
        } else {
            // Emitir evento para manejo de la aplicación
            this.app.handleBackButton();
        }
        
        this.emit('back');
    }

    /**
     * Envolver navegación (wrap around)
     */
    wrapNavigation(direction) {
        let targetElement = null;
        
        switch (direction) {
            case 'up':
                // Ir al último elemento de la columna
                targetElement = this.findLastInColumn();
                break;
            case 'down':
                // Ir al primer elemento de la columna
                targetElement = this.findFirstInColumn();
                break;
            case 'left':
                // Ir al último elemento de la fila
                targetElement = this.findLastInRow();
                break;
            case 'right':
                // Ir al primer elemento de la fila
                targetElement = this.findFirstInRow();
                break;
        }
        
        if (targetElement) {
            this.setFocus(targetElement);
        }
    }

    /**
     * Encontrar elementos en fila/columna
     */
    findFirstInColumn() {
        const currentRect = this.currentFocus.getBoundingClientRect();
        const tolerance = 50;
        
        const inColumn = this.focusableElements.filter(el => {
            const rect = el.getBoundingClientRect();
            return Math.abs(rect.left - currentRect.left) < tolerance;
        });
        
        inColumn.sort((a, b) => {
            return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        });
        
        return inColumn[0];
    }

    findLastInColumn() {
        const currentRect = this.currentFocus.getBoundingClientRect();
        const tolerance = 50;
        
        const inColumn = this.focusableElements.filter(el => {
            const rect = el.getBoundingClientRect();
            return Math.abs(rect.left - currentRect.left) < tolerance;
        });
        
        inColumn.sort((a, b) => {
            return b.getBoundingClientRect().top - a.getBoundingClientRect().top;
        });
        
        return inColumn[0];
    }

    findFirstInRow() {
        const currentRect = this.currentFocus.getBoundingClientRect();
        const tolerance = 50;
        
        const inRow = this.focusableElements.filter(el => {
            const rect = el.getBoundingClientRect();
            return Math.abs(rect.top - currentRect.top) < tolerance;
        });
        
        inRow.sort((a, b) => {
            return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
        });
        
        return inRow[0];
    }

    findLastInRow() {
        const currentRect = this.currentFocus.getBoundingClientRect();
        const tolerance = 50;
        
        const inRow = this.focusableElements.filter(el => {
            const rect = el.getBoundingClientRect();
            return Math.abs(rect.top - currentRect.top) < tolerance;
        });
        
        inRow.sort((a, b) => {
            return b.getBoundingClientRect().left - a.getBoundingClientRect().left;
        });
        
        return inRow[0];
    }

    /**
     * Verificar si elemento es focusable
     */
    isFocusable(element) {
        if (!element) return false;
        
        return element.matches(this.config.focusableSelector) && 
               !element.disabled && 
               element.offsetParent !== null; // Visible
    }

    /**
     * Manejar teclas de color
     */
    handleColorKey(color) {
        // Buscar elementos con acción de color
        const colorAction = document.querySelector(`[data-color-action="${color}"]`);
        
        if (colorAction) {
            colorAction.click();
        }
        
        this.emit('colorKey', color);
    }

    /**
     * Manejar teclas numéricas
     */
    handleNumericKey(number) {
        // Buscar elementos con acceso rápido numérico
        const quickAccess = document.querySelector(`[data-quick-access="${number}"]`);
        
        if (quickAccess) {
            this.setFocus(quickAccess);
            this.select();
        }
        
        this.emit('numericKey', number);
    }

    /**
     * Manejar eventos de mouse (para desarrollo)
     */
    handleMouseOver(event) {
        if (!this.enabled) return;
        
        const focusable = event.target.closest(this.config.focusableSelector);
        if (focusable && this.isFocusable(focusable)) {
            this.setFocus(focusable);
        }
    }

    handleClick(event) {
        if (!this.enabled) return;
        
        const focusable = event.target.closest(this.config.focusableSelector);
        if (focusable && this.isFocusable(focusable)) {
            this.setFocus(focusable);
            // Click ya se maneja naturalmente
        }
    }

    /**
     * Manejar gamepad
     */
    handleGamepadConnected(event) {
        console.log('Gamepad connected:', event.gamepad);
        this.gamepad = event.gamepad;
        this.startGamepadPolling();
    }

    handleGamepadDisconnected(event) {
        console.log('Gamepad disconnected:', event.gamepad);
        this.gamepad = null;
        this.stopGamepadPolling();
    }

    startGamepadPolling() {
        if (this.gamepadInterval) return;
        
        let lastButtons = [];
        
        this.gamepadInterval = setInterval(() => {
            if (!this.gamepad) return;
            
            const gamepad = navigator.getGamepads()[this.gamepad.index];
            if (!gamepad) return;
            
            // Verificar botones
            gamepad.buttons.forEach((button, index) => {
                if (button.pressed && !lastButtons[index]) {
                    this.handleGamepadButton(index);
                }
                lastButtons[index] = button.pressed;
            });
            
            // Verificar axes (joysticks)
            const threshold = 0.5;
            
            if (Math.abs(gamepad.axes[0]) > threshold) {
                // Horizontal
                this.navigate(gamepad.axes[0] > 0 ? 'right' : 'left');
            }
            
            if (Math.abs(gamepad.axes[1]) > threshold) {
                // Vertical
                this.navigate(gamepad.axes[1] > 0 ? 'down' : 'up');
            }
            
        }, 100); // 10Hz polling
    }

    stopGamepadPolling() {
        if (this.gamepadInterval) {
            clearInterval(this.gamepadInterval);
            this.gamepadInterval = null;
        }
    }

    

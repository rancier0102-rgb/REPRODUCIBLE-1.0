
/**
 * Virtual Scroll Module
 * Renderizado virtual para listas grandes
 */

class VirtualScroll {
    constructor(app) {
        this.app = app;
        this.containers = new Map();
        
        this.config = {
            itemHeight: 80, // Altura de cada item
            buffer: 5, // Items extra para renderizar
            scrollDebounce: 10,
            overscan: 3, // Items fuera de vista para suavidad
            minItems: 20,
            maxItems: 1000
        };
    }

    /**
     * Inicializar virtual scroll
     */
    init() {
        this.detectContainers();
        this.setupEventListeners();
    }

    /**
     * Detectar contenedores con virtual scroll
     */
    detectContainers() {
        const containers = document.querySelectorAll('[data-virtual-scroll]');
        
        containers.forEach(container => {
            this.setupContainer(container);
        });
    }

    /**
     * Configurar contenedor
     */
    setupContainer(container) {
        const config = {
            itemHeight: parseInt(container.dataset.itemHeight) || this.config.itemHeight,
            items: [],
            visibleStart: 0,
            visibleEnd: 0,
            scrollTop: 0,
            containerHeight: 0,
            totalHeight: 0,
            scrollHandler: null,
            wrapper: null,
            content: null,
            spacerTop: null,
            spacerBottom: null
        };
        
        // Crear estructura DOM
        this.createScrollStructure(container, config);
        
        // Guardar configuración
        this.containers.set(container, config);
        
        // Configurar scroll listener
        this.setupScrollListener(container, config);
        
        // Renderizar inicial
        this.updateVirtualScroll(container);
    }

    /**
     * Crear estructura DOM para virtual scroll
     */
    createScrollStructure(container, config) {
        // Wrapper para el contenido
        config.wrapper = document.createElement('div');
        config.wrapper.className = 'virtual-scroll-wrapper';
        config.wrapper.style.position = 'relative';
        config.wrapper.style.height = '100%';
        config.wrapper.style.overflow = 'auto';
        
        // Contenido visible
        config.content = document.createElement('div');
        config.content.className = 'virtual-scroll-content';
        config.content.style.position = 'relative';
        
        // Espaciadores
        config.spacerTop = document.createElement('div');
        config.spacerTop.className = 'virtual-scroll-spacer-top';
        
        config.spacerBottom = document.createElement('div');
        config.spacerBottom.className = 'virtual-scroll-spacer-bottom';
        
        // Mover contenido existente
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        
        // Armar estructura
        config.wrapper.appendChild(config.spacerTop);
        config.wrapper.appendChild(config.content);
        config.wrapper.appendChild(config.spacerBottom);
        container.appendChild(config.wrapper);
    }

    /**
     * Configurar scroll listener
     */
    setupScrollListener(container, config) {
        let scrollTimeout;
        
        config.scrollHandler = (event) => {
            config.scrollTop = event.target.scrollTop;
            
            // Debounce para optimización
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.updateVirtualScroll(container);
            }, this.config.scrollDebounce);
            
            // Actualización inmediata para scroll suave
            requestAnimationFrame(() => {
                this.quickUpdate(container, config);
            });
        };
        
        config.wrapper.addEventListener('scroll', config.scrollHandler);
    }

    /**
     * Actualización rápida durante scroll
     */
    quickUpdate(container, config) {
        const scrollTop = config.scrollTop;
        const containerHeight = config.containerHeight;
        
        // Calcular rango visible
        const visibleStart = Math.floor(scrollTop / config.itemHeight);
        const visibleEnd = Math.ceil((scrollTop + containerHeight) / config.itemHeight);
        
        // Si el cambio es significativo, actualizar
        if (Math.abs(visibleStart - config.visibleStart) > 5 || 
            Math.abs(visibleEnd - config.visibleEnd) > 5) {
            this.updateVirtualScroll(container);
        }
    }

    /**
     * Actualizar virtual scroll
     */
    updateVirtualScroll(container) {
        const config = this.containers.get(container);
        if (!config) return;
        
        // Obtener dimensiones
        config.containerHeight = config.wrapper.clientHeight;
        const scrollTop = config.scrollTop;
        
        // Calcular items visibles
        const visibleStart = Math.max(0, 
            Math.floor(scrollTop / config.itemHeight) - this.config.overscan
        );
        const visibleEnd = Math.min(config.items.length - 1,
            Math.ceil((scrollTop + config.containerHeight) / config.itemHeight) + this.config.overscan
        );
        
        // Solo actualizar si cambió el rango
        if (visibleStart !== config.visibleStart || visibleEnd !== config.visibleEnd) {
            config.visibleStart = visibleStart;
            config.visibleEnd = visibleEnd;
            
            this.renderVisibleItems(container, config);
        }
    }

    /**
     * Renderizar items visibles
     */
    renderVisibleItems(container, config) {
        const { items, visibleStart, visibleEnd, itemHeight } = config;
        
        // Limpiar contenido actual
        config.content.innerHTML = '';
        
        // Calcular espaciadores
        const spacerTopHeight = visibleStart * itemHeight;
        const spacerBottomHeight = Math.max(0, (items.length - visibleEnd - 1) * itemHeight);
        
        config.spacerTop.style.height = `${spacerTopHeight}px`;
        config.spacerBottom.style.height = `${spacerBottomHeight}px`;
        
        // Renderizar items visibles
        const fragment = document.createDocumentFragment();
        
        for (let i = visibleStart; i <= visibleEnd && i < items.length; i++) {
            const itemElement = this.renderItem(items[i], i);
            fragment.appendChild(itemElement);
        }
        
        config.content.appendChild(fragment);
        
        // Emitir evento
        this.app.emit('virtualScroll:update', {
            container,
            visibleStart,
            visibleEnd,
            totalItems: items.length
        });
    }

    /**
     * Renderizar un item
     */
    renderItem(item, index) {
        // Buscar template o usar función de render
        const template = item.template || this.getDefaultTemplate(item);
        
        const element = document.createElement('div');
        element.className = 'virtual-scroll-item';
        element.dataset.index = index;
        element.style.height = `${this.containers.get(item.container).itemHeight}px`;
        
        if (typeof template === 'function') {
            element.innerHTML = template(item);
        } else {
            element.innerHTML = template;
        }
        
        // Hacer focusable para navegación
        element.setAttribute('data-focusable', 'true');
        
        return element;
    }

    /**
     * Template por defecto
     */
    getDefaultTemplate(item) {
        return `
            <div class="item-content">
                ${item.image ? `<img data-lazy="${item.image}" class="item-image" />` : ''}
                <div class="item-info">
                    <h3 class="item-title">${item.title || ''}</h3>
                    <p class="item-subtitle">${item.subtitle || ''}</p>
                </div>
            </div>
        `;
    }

    /**
     * Establecer items en contenedor
     */
    setItems(container, items) {
        const config = this.containers.get(container);
        if (!config) return;
        
        config.items = items;
        config.totalHeight = items.length * config.itemHeight;
        
        // Resetear scroll
        config.scrollTop = 0;
        config.wrapper.scrollTop = 0;
        
        // Actualizar vista
        this.updateVirtualScroll(container);
    }

    /**
     * Agregar items
     */
    addItems(container, newItems, position = 'end') {
        const config = this.containers.get(container);
        if (!config) return;
        
        if (position === 'end') {
            config.items.push(...newItems);
        } else if (position === 'start') {
            config.items.unshift(...newItems);
        } else if (typeof position === 'number') {
            config.items.splice(position, 0, ...newItems);
        }
        
        config.totalHeight = config.items.length * config.itemHeight;
        this.updateVirtualScroll(container);
    }

    /**
     * Remover items
     */
    removeItems(container, indices) {
        const config = this.containers.get(container);
        if (!config) return;
        
        // Ordenar índices de mayor a menor para eliminar correctamente
        indices.sort((a, b) => b - a);
        
        indices.forEach(index => {
            config.items.splice(index, 1);
        });
        
        config.totalHeight = config.items.length * config.itemHeight;
        this.updateVirtualScroll(container);
    }

    /**
     * Actualizar item
     */
    updateItem(container, index, newData) {
        const config = this.containers.get(container);
        if (!config || !config.items[index]) return;
        
        Object.assign(config.items[index], newData);
        
        // Si el item está visible, actualizar
        if (index >= config.visibleStart && index <= config.visibleEnd) {
            this.renderVisibleItems(container, config);
        }
    }

    /**
     * Scroll a item
     */
    scrollToItem(container, index, position = 'top') {
        const config = this.containers.get(container);
        if (!config || !config.items[index]) return;
        
        const itemTop = index * config.itemHeight;
        let scrollTop;
        
        switch (position) {
            case 'top':
                scrollTop = itemTop;
                break;
            case 'center':
                scrollTop = itemTop - (config.containerHeight / 2) + (config.itemHeight / 2);
                break;
            case 'bottom':
                scrollTop = itemTop - config.containerHeight + config.itemHeight;
                break;
        }
        
        config.wrapper.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
        });
    }

    /**
     * Obtener item en índice
     */
    getItem(container, index) {
        const config = this.containers.get(container);
        return config?.items[index];
    }

    /**
     * Obtener todos los items
     */
    getItems(container) {
        const config = this.containers.get(container);
        return config?.items || [];
    }

    /**
     * Configurar event listeners globales
     */
    setupEventListeners() {
        // Actualizar en resize
        window.addEventListener('resize', () => {
            this.containers.forEach((config, container) => {
                this.updateVirtualScroll(container);
            });
        });
        
        // Detectar nuevos contenedores cuando se agregue contenido
        document.addEventListener('contentAdded', () => {
            this.detectContainers();
        });
    }

    /**
     * Optimizar rendimiento
     */
    optimizePerformance(container) {
        const config = this.containers.get(container);
        if (!config) return;
        
        // Usar requestIdleCallback para renderizado no crítico
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                this.renderVisibleItems(container, config);
            });
        }
        
        // Usar Web Workers para procesamiento pesado si está disponible
        if (window.Worker && config.items.length > this.config.maxItems) {
            this.processWithWorker(container, config);
        }
    }

    /**
     * Limpiar recursos
     */
    destroy(container) {
        if (container) {
            const config = this.containers.get(container);
            if (config) {
                config.wrapper.removeEventListener('scroll', config.scrollHandler);
                this.containers.delete(container);
            }
        } else {
            // Limpiar todos
            this.containers.forEach((config, cont) => {
                config.wrapper.removeEventListener('scroll', config.scrollHandler);
            });
            this.containers.clear();
        }
    }
}

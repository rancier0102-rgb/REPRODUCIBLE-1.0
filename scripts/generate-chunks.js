#!/usr/bin/env node

/**
 * Generate Chunks Script
 * Fragmenta los datos JSON en chunks optimizados para carga lazy
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const CONFIG = {
    DATA_DIR: path.join(__dirname, '../data/movies'),
    OUTPUT_DIR: path.join(__dirname, '../dist/data/movies'),
    CHUNK_SIZE: 50, // Películas por chunk
    MAX_FILE_SIZE: 100 * 1024, // 100KB máximo por archivo
    ENABLE_COMPRESSION: true,
    GENERATE_INDEX: true,
    GENERATE_MANIFEST: true,
    PRETTY_PRINT: false // false en producción para menor tamaño
};

// Estadísticas
const stats = {
    totalMovies: 0,
    totalChunks: 0,
    totalSize: 0,
    originalSize: 0,
    compressionRatio: 0,
    processingTime: 0,
    errors: []
};

/**
 * Clase principal para generar chunks
 */
class ChunkGenerator {
    constructor(config) {
        this.config = config;
        this.movies = [];
        this.chunks = [];
        this.index = null;
        this.manifest = null;
    }

    /**
     * Ejecutar proceso completo
     */
    async run() {
        const startTime = performance.now();
        const spinner = ora('Iniciando generación de chunks...').start();

        try {
            // 1. Cargar datos
            spinner.text = 'Cargando datos de películas...';
            await this.loadMovieData();
            
            // 2. Validar y limpiar datos
            spinner.text = 'Validando datos...';
            await this.validateData();
            
            // 3. Optimizar datos
            spinner.text = 'Optimizando estructura de datos...';
            await this.optimizeData();
            
            // 4. Generar chunks
            spinner.text = 'Generando chunks...';
            await this.generateChunks();
            
            // 5. Generar índices
            spinner.text = 'Generando índices...';
            await this.generateIndices();
            
            // 6. Generar manifesto
            spinner.text = 'Generando manifiesto...';
            await this.generateManifest();
            
            // 7. Escribir archivos
            spinner.text = 'Escribiendo archivos...';
            await this.writeFiles();
            
            // 8. Generar reporte
            stats.processingTime = performance.now() - startTime;
            stats.compressionRatio = ((1 - (stats.totalSize / stats.originalSize)) * 100).toFixed(2);
            
            spinner.succeed(chalk.green('✓ Chunks generados exitosamente!'));
            this.printReport();
            
        } catch (error) {
            spinner.fail(chalk.red('✗ Error generando chunks'));
            console.error(chalk.red(error));
            process.exit(1);
        }
    }

    /**
     * Cargar datos de películas
     */
    async loadMovieData() {
        const dataPath = path.join(this.config.DATA_DIR, 'metadata', 'movies-full.json');
        
        try {
            const rawData = await fs.readFile(dataPath, 'utf8');
            stats.originalSize = Buffer.byteLength(rawData);
            
            const data = JSON.parse(rawData);
            this.movies = data.movies || [];
            stats.totalMovies = this.movies.length;
            
            if (this.movies.length === 0) {
                throw new Error('No se encontraron películas en el archivo de datos');
            }
            
            console.log(chalk.blue(`→ Cargadas ${this.movies.length} películas`));
            
        } catch (error) {
            // Si no existe el archivo completo, generar datos de ejemplo
            if (error.code === 'ENOENT') {
                console.log(chalk.yellow('⚠ No se encontró archivo de datos, generando datos de ejemplo...'));
                this.movies = await this.generateSampleData();
                stats.totalMovies = this.movies.length;
            } else {
                throw error;
            }
        }
    }

    /**
     * Generar datos de ejemplo
     */
    async generateSampleData() {
        const categories = ['action', 'comedy', 'drama', 'thriller', 'horror', 'scifi', 'romance'];
        const sampleMovies = [];
        
        for (let i = 1; i <= 500; i++) {
            sampleMovies.push({
                id: `movie_${String(i).padStart(3, '0')}`,
                title: `Película ${i}`,
                originalTitle: `Movie ${i}`,
                slug: `pelicula-${i}`,
                year: 2020 + Math.floor(Math.random() * 5),
                duration: 90 + Math.floor(Math.random() * 60),
                rating: (5 + Math.random() * 5).toFixed(1),
                votes: Math.floor(Math.random() * 100000),
                popularity: (Math.random() * 100).toFixed(1),
                releaseDate: new Date(2020 + Math.floor(Math.random() * 5), 
                                     Math.floor(Math.random() * 12), 
                                     Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
                synopsis: `Esta es la sinopsis de la película ${i}. Una historia emocionante llena de aventuras.`,
                categories: [categories[Math.floor(Math.random() * categories.length)]],
                director: {
                    id: `dir_${Math.floor(Math.random() * 50) + 1}`,
                    name: `Director ${Math.floor(Math.random() * 50) + 1}`
                },
                cast: [
                    {
                        id: `act_${Math.floor(Math.random() * 100) + 1}`,
                        name: `Actor ${Math.floor(Math.random() * 100) + 1}`,
                        character: `Personaje Principal`,
                        order: 1
                    }
                ],
                images: {
                    thumbnail: {
                        webp: `/thumbnails/movie_${String(i).padStart(3, '0')}_300x450.webp`,
                        jpg: `/thumbnails/movie_${String(i).padStart(3, '0')}_300x450.jpg`,
                        blurhash: this.generateBlurhash()
                    },
                    poster: {
                        webp: `/posters/movie_${String(i).padStart(3, '0')}_600x900.webp`,
                        jpg: `/posters/movie_${String(i).padStart(3, '0')}_600x900.jpg`,
                        blurhash: this.generateBlurhash()
                    }
                },
                streaming: {
                    available: Math.random() > 0.2,
                    url: `/api/stream/movie_${String(i).padStart(3, '0')}`,
                    qualities: ['1080p', '720p', '480p']
                }
            });
        }
        
        return sampleMovies;
    }

    /**
     * Generar blurhash aleatorio
     */
    generateBlurhash() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%*+,-.:;=?@[]^_{|}~';
        let hash = 'L';
        for (let i = 0; i < 19; i++) {
            hash += chars[Math.floor(Math.random() * chars.length)];
        }
        return hash;
    }

    /**
     * Validar estructura de datos
     */
    async validateData() {
        const requiredFields = ['id', 'title', 'year', 'categories'];
        const errors = [];
        
        this.movies = this.movies.filter((movie, index) => {
            // Verificar campos requeridos
            for (const field of requiredFields) {
                if (!movie[field]) {
                    errors.push(`Película en índice ${index} falta campo: ${field}`);
                    return false;
                }
            }
            
            // Validar tipos de datos
            if (typeof movie.rating === 'string') {
                movie.rating = parseFloat(movie.rating);
            }
            if (typeof movie.votes === 'string') {
                movie.votes = parseInt(movie.votes);
            }
            if (typeof movie.duration === 'string') {
                movie.duration = parseInt(movie.duration);
            }
            
            return true;
        });
        
        if (errors.length > 0) {
            stats.errors = errors;
            console.log(chalk.yellow(`⚠ Se encontraron ${errors.length} errores de validación`));
        }
    }

    /**
     * Optimizar estructura de datos
     */
    async optimizeData() {
        this.movies = this.movies.map(movie => {
            const optimized = {
                id: movie.id,
                t: movie.title, // Usar keys cortas para reducir tamaño
                ot: movie.originalTitle,
                s: movie.slug,
                y: movie.year,
                d: movie.duration,
                r: parseFloat(movie.rating),
                v: movie.votes,
                p: parseFloat(movie.popularity),
                rd: movie.releaseDate,
                sy: movie.synopsis,
                c: movie.categories,
                dr: movie.director ? {
                    i: movie.director.id,
                    n: movie.director.name
                } : null,
                ca: movie.cast ? movie.cast.slice(0, 3).map(actor => ({ // Limitar cast a 3
                    i: actor.id,
                    n: actor.name,
                    ch: actor.character,
                    o: actor.order
                })) : [],
                im: {
                    t: movie.images?.thumbnail || {},
                    p: movie.images?.poster || {},
                    b: movie.images?.backdrop || {}
                },
                st: movie.streaming ? {
                    a: movie.streaming.available,
                    u: movie.streaming.url,
                    q: movie.streaming.qualities
                } : null,
                ui: movie.userInteraction || {}
            };
            
            // Eliminar campos nulos o undefined para ahorrar espacio
            Object.keys(optimized).forEach(key => {
                if (optimized[key] === null || optimized[key] === undefined) {
                    delete optimized[key];
                }
            });
            
            return optimized;
        });
        
        // Ordenar por popularidad para chunks más relevantes primero
        this.movies.sort((a, b) => (b.p || 0) - (a.p || 0));
    }

    /**
     * Generar chunks
     */
    async generateChunks() {
        const chunkSize = this.config.CHUNK_SIZE;
        const totalChunks = Math.ceil(this.movies.length / chunkSize);
        
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, this.movies.length);
            const chunkMovies = this.movies.slice(start, end);
            
            const chunk = {
                page: i + 1,
                totalPages: totalChunks,
                itemsPerPage: chunkSize,
                totalItems: this.movies.length,
                items: chunkMovies,
                generatedAt: new Date().toISOString(),
                checksum: this.generateChecksum(JSON.stringify(chunkMovies))
            };
            
            // Agregar navegación
            if (i > 0) {
                chunk.prevPage = `/data/movies/metadata/page-${i}.json`;
            }
            if (i < totalChunks - 1) {
                chunk.nextPage = `/data/movies/metadata/page-${i + 2}.json`;
            }
            
            this.chunks.push(chunk);
        }
        
        stats.totalChunks = this.chunks.length;
        console.log(chalk.blue(`→ Generados ${this.chunks.length} chunks`));
    }

    /**
     * Generar índices para búsqueda rápida
     */
    async generateIndices() {
        // Índice principal
        this.index = {
            version: '1.0.0',
            lastUpdate: new Date().toISOString(),
            totalMovies: this.movies.length,
            totalPages: this.chunks.length,
            itemsPerPage: this.config.CHUNK_SIZE,
            pages: []
        };
        
        // Índice de categorías
        const categoriesMap = new Map();
        
        // Índice de búsqueda
        const searchIndex = {
            byTitle: {},
            byYear: {},
            byCategory: {},
            byRating: {}
        };
        
        // Procesar cada chunk
        this.chunks.forEach((chunk, index) => {
            // Agregar info del chunk al índice
            const chunkInfo = {
                pageNumber: chunk.page,
                url: `/data/movies/metadata/page-${chunk.page}.json`,
                items: chunk.items.length,
                size: 0, // Se calculará después
                checksum: chunk.checksum,
                movieIds: chunk.items.map(m => m.id)
            };
            
            this.index.pages.push(chunkInfo);
            
            // Procesar películas para índices
            chunk.items.forEach(movie => {
                // Índice de categorías
                if (movie.c) {
                    movie.c.forEach(cat => {
                        if (!categoriesMap.has(cat)) {
                            categoriesMap.set(cat, []);
                        }
                        categoriesMap.get(cat).push(movie.id);
                    });
                }
                
                // Índice de búsqueda por título (primera letra)
                const firstLetter = (movie.t || '').charAt(0).toLowerCase();
                if (firstLetter) {
                    if (!searchIndex.byTitle[firstLetter]) {
                        searchIndex.byTitle[firstLetter] = [];
                    }
                    searchIndex.byTitle[firstLetter].push({
                        id: movie.id,
                        title: movie.t,
                        year: movie.y,
                        page: chunk.page
                    });
                }
                
                // Índice por año
                if (movie.y) {
                    if (!searchIndex.byYear[movie.y]) {
                        searchIndex.byYear[movie.y] = [];
                    }
                    searchIndex.byYear[movie.y].push(movie.id);
                }
                
                // Índice por rating (agrupado)
                if (movie.r) {
                    const ratingGroup = Math.floor(movie.r);
                    if (!searchIndex.byRating[ratingGroup]) {
                        searchIndex.byRating[ratingGroup] = [];
                    }
                    searchIndex.byRating[ratingGroup].push(movie.id);
                }
            });
        });
        
        // Convertir mapa de categorías a objeto
        this.index.categories = Array.from(categoriesMap.entries()).map(([key, value]) => ({
            id: key,
            count: value.length,
            movies: value
        }));
        
        // Guardar índice de búsqueda
        this.searchIndex = searchIndex;
    }

    /**
     * Generar manifiesto de actualización
     */
    async generateManifest() {
        this.manifest = {
            version: '1.0.0',
            lastSync: new Date().toISOString(),
            updates: [],
            syncStrategy: {
                interval: 3600, // 1 hora
                onDemand: true,
                background: true,
                wifi_only: false
            },
            cachePolicy: {
                metadata: {
                    ttl: 3600,
                    strategy: 'stale-while-revalidate'
                },
                images: {
                    ttl: 604800, // 1 semana
                    strategy: 'cache-first'
                },
                collections: {
                    ttl: 300, // 5 minutos
                    strategy: 'network-first'
                }
            },
            files: []
        };
        
        // Agregar archivos al manifiesto
        this.chunks.forEach(chunk => {
            this.manifest.files.push({
                path: `/data/movies/metadata/page-${chunk.page}.json`,
                checksum: chunk.checksum,
                size: 0, // Se calculará al escribir
                required: chunk.page === 1 // Solo el primer chunk es requerido
            });
        });
        
        // Agregar índices
        this.manifest.files.push({
            path: '/data/movies/metadata/index.json',
            checksum: this.generateChecksum(JSON.stringify(this.index)),
            size: 0,
            required: true
        });
    }

    /**
     * Escribir archivos
     */
    async writeFiles() {
        // Crear directorio de salida
        await fs.mkdir(this.config.OUTPUT_DIR, { recursive: true });
        await fs.mkdir(path.join(this.config.OUTPUT_DIR, 'metadata'), { recursive: true });
        await fs.mkdir(path.join(this.config.OUTPUT_DIR, 'search'), { recursive: true });
        
        // Escribir chunks
        for (const chunk of this.chunks) {
            const filename = path.join(this.config.OUTPUT_DIR, 'metadata', `page-${chunk.page}.json`);
            const content = this.config.PRETTY_PRINT 
                ? JSON.stringify(chunk, null, 2) 
                : JSON.stringify(chunk);
            
            await fs.writeFile(filename, content, 'utf8');
            
            const size = Buffer.byteLength(content);
            stats.totalSize += size;
            
            // Actualizar tamaño en índice y manifiesto
            const indexPage = this.index.pages.find(p => p.pageNumber === chunk.page);
            if (indexPage) indexPage.size = size;
            
            const manifestFile = this.manifest.files.find(f => f.path.includes(`page-${chunk.page}.json`));
            if (manifestFile) manifestFile.size = size;
            
            // Verificar tamaño máximo
            if (size > this.config.MAX_FILE_SIZE) {
                console.log(chalk.yellow(`⚠ Chunk ${chunk.page} excede el tamaño máximo: ${(size / 1024).toFixed(2)}KB`));
            }
        }
        
        // Escribir índice principal
        const indexContent = this.config.PRETTY_PRINT 
            ? JSON.stringify(this.index, null, 2) 
            : JSON.stringify(this.index);
        
        await fs.writeFile(
            path.join(this.config.OUTPUT_DIR, 'metadata', 'index.json'),
            indexContent,
            'utf8'
        );
        stats.totalSize += Buffer.byteLength(indexContent);
        
        // Escribir índice de búsqueda
        const searchContent = this.config.PRETTY_PRINT 
            ? JSON.stringify(this.searchIndex, null, 2) 
            : JSON.stringify(this.searchIndex);
        
        await fs.writeFile(
            path.join(this.config.OUTPUT_DIR, 'search', 'index.json'),
            searchContent,
            'utf8'
        );
        stats.totalSize += Buffer.byteLength(searchContent);
        
        // Escribir manifiesto
        const manifestContent = this.config.PRETTY_PRINT 
            ? JSON.stringify(this.manifest, null, 2) 
            : JSON.stringify(this.manifest);
        
        await fs.writeFile(
            path.join(this.config.OUTPUT_DIR, 'metadata', 'manifest.json'),
            manifestContent,
            'utf8'
        );
        stats.totalSize += Buffer.byteLength(manifestContent);
        
        console.log(chalk.blue(`→ Escritos ${this.chunks.length + 3} archivos`));
    }

    /**
     * Generar checksum
     */
    generateChecksum(data) {
        return crypto
            .createHash('sha256')
            .update(data)
            .digest('hex')
            .substring(0, 12);
    }

    /**
     * Imprimir reporte
     */
    printReport() {
        console.log('\n' + chalk.cyan('═'.repeat(60)));
        console.log(chalk.cyan.bold('📊 REPORTE DE GENERACIÓN DE CHUNKS'));
        console.log(chalk.cyan('═'.repeat(60)));
        
        console.log(chalk.white(`
  ${chalk.bold('Películas procesadas:')} ${chalk.green(stats.totalMovies.toLocaleString())}
  ${chalk.bold('Chunks generados:')}     ${chalk.green(stats.totalChunks)}
  ${chalk.bold('Tamaño original:')}      ${chalk.yellow(this.formatBytes(stats.originalSize))}
  ${chalk.bold('Tamaño final:')}         ${chalk.green(this.formatBytes(stats.totalSize))}
  ${chalk.bold('Compresión:')}           ${chalk.green(stats.compressionRatio + '%')}
  ${chalk.bold('Tiempo de proceso:')}    ${chalk.blue((stats.processingTime / 1000).toFixed(2) + 's')}
        `));
        
        if (stats.errors.length > 0) {
            console.log(chalk.red(`\n  ⚠️  ${stats.errors.length} errores encontrados`));
        }
        
        console.log(chalk.cyan('═'.repeat(60)) + '\n');
        
        // Guardar reporte en archivo
        this.saveReport();
    }

    /**
     * Guardar reporte en archivo
     */
    async saveReport() {
        const report = {
            ...stats,
            timestamp: new Date().toISOString(),
            config: this.config
        };
        
        await fs.writeFile(
            path.join(this.config.OUTPUT_DIR, 'generation-report.json'),
            JSON.stringify(report, null, 2),
            'utf8'
        );
    }

    /**
     * Formatear bytes
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Ejecutar script
async function main() {
    console.log(chalk.cyan.bold('\n🎬 TV Cinema - Generador de Chunks\n'));
    
    const generator = new ChunkGenerator(CONFIG);
    await generator.run();
}

// Manejo de errores
process.on('unhandledRejection', (error) => {
    console.error(chalk.red('Error no manejado:'), error);
    process.exit(1);
});

// Ejecutar si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default ChunkGenerator;

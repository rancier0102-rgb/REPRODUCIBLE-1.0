#!/usr/bin/env node

/**
 * Image Optimizer Script
 * Optimiza y genera múltiples versiones de imágenes para TV
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import imagemin from 'imagemin';
import imageminWebp from 'imagemin-webp';
import imageminMozjpeg from 'imagemin-mozjpeg';
import imageminPngquant from 'imagemin-pngquant';
import { createHash } from 'crypto';
import { performance } from 'perf_hooks';
import chalk from 'chalk';
import ora from 'ora';
import pLimit from 'p-limit';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const CONFIG = {
    INPUT_DIR: path.join(__dirname, '../assets/images/original'),
    OUTPUT_DIR: path.join(__dirname, '../dist/data/movies/images'),
    CONCURRENT_LIMIT: 4, // Procesamiento paralelo limitado
    
    // Configuración de tamaños
    SIZES: {
        thumbnail: { width: 300, height: 450, quality: 80 },
        poster: { width: 600, height: 900, quality: 85 },
        backdrop: { width: 1920, height: 1080, quality: 85 },
        hero: { width: 3840, height: 2160, quality: 90 }
    },
    
    // Formatos de salida
    FORMATS: ['webp', 'jpg'],
    
    // Calidad por formato
    QUALITY: {
        webp: 85,
        jpg: 85,
        png: 90
    },
    
    // Opciones de optimización
    OPTIMIZATION: {
        progressive: true,
        mozjpeg: true,
        pngquant: true,
        strip: true, // Eliminar metadata
        generateBlurhash: true,
        generateLQIP: true // Low Quality Image Placeholder
    }
};

// Estadísticas
const stats = {
    totalImages: 0,
    processedImages: 0,
    totalSizeBefore: 0,
    totalSizeAfter: 0,
    errors: [],
    startTime: 0,
    endTime: 0
};

/**
 * Clase principal para optimización de imágenes
 */
class ImageOptimizer {
    constructor(config) {
        this.config = config;
        this.limit = pLimit(config.CONCURRENT_LIMIT);
        this.processedFiles = new Set();
        this.manifest = {
            version: '1.0.0',
            generated: new Date().toISOString(),
            images: []
        };
    }

    /**
     * Ejecutar optimización
     */
    async run() {
        stats.startTime = performance.now();
        const spinner = ora('Iniciando optimización de imágenes...').start();

        try {
            // 1. Verificar directorios
            spinner.text = 'Verificando directorios...';
            await this.setupDirectories();
            
            // 2. Escanear imágenes
            spinner.text = 'Escaneando imágenes...';
            const images = await this.scanImages();
            stats.totalImages = images.length;
            
            if (images.length === 0) {
                spinner.warn('No se encontraron imágenes para procesar');
                return;
            }
            
            // 3. Procesar imágenes
            spinner.text = `Procesando ${images.length} imágenes...`;
            await this.processImages(images, spinner);
            
            // 4. Generar sprites para preview
            spinner.text = 'Generando sprites de preview...';
            await this.generateSprites();
            
            // 5. Generar manifiesto
            spinner.text = 'Generando manifiesto...';
            await this.generateManifest();
            
            // 6. Mostrar reporte
            stats.endTime = performance.now();
            spinner.succeed(chalk.green('✓ Optimización completada!'));
            this.printReport();
            
        } catch (error) {
            spinner.fail(chalk.red('✗ Error en la optimización'));
            console.error(chalk.red(error));
            process.exit(1);
        }
    }

    /**
     * Configurar directorios
     */
    async setupDirectories() {
        // Crear directorios de salida
        for (const size of Object.keys(this.config.SIZES)) {
            const dir = path.join(this.config.OUTPUT_DIR, `${size}s`);
            await fs.mkdir(dir, { recursive: true });
        }
        
        // Directorio para sprites
        await fs.mkdir(path.join(this.config.OUTPUT_DIR, 'sprites'), { recursive: true });
        
        // Directorio para placeholders
        await fs.mkdir(path.join(this.config.OUTPUT_DIR, 'placeholders'), { recursive: true });
    }

    /**
     * Escanear imágenes de entrada
     */
    async scanImages() {
        try {
            const files = await fs.readdir(this.config.INPUT_DIR);
            return files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(chalk.yellow('⚠ Directorio de imágenes no encontrado, creando con ejemplos...'));
                await this.createSampleImages();
                return this.scanImages();
            }
            throw error;
        }
    }

    /**
     * Crear imágenes de ejemplo
     */
    async createSampleImages() {
        await fs.mkdir(this.config.INPUT_DIR, { recursive: true });
        
        // Generar 10 imágenes de ejemplo
        for (let i = 1; i <= 10; i++) {
            const filename = path.join(this.config.INPUT_DIR, `movie_${String(i).padStart(3, '0')}.jpg`);
            
            // Crear imagen con gradiente aleatorio
            const width = 600;
            const height = 900;
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];
            const color = colors[i % colors.length];
            
            await sharp({
                create: {
                    width,
                    height,
                    channels: 3,
                    background: color
                }
            })
            .jpeg({ quality: 90 })
            .toFile(filename);
        }
        
        console.log(chalk.blue('→ Creadas 10 imágenes de ejemplo'));
    }

    /**
     * Procesar imágenes
     */
    async processImages(images, spinner) {
        const tasks = images.map(image => 
            this.limit(() => this.processImage(image, spinner))
        );
        
        await Promise.all(tasks);
    }

    /**
     * Procesar una imagen
     */
    async processImage(filename, spinner) {
        const inputPath = path.join(this.config.INPUT_DIR, filename);
        const basename = path.basename(filename, path.extname(filename));
        
        try {
            // Obtener metadata
            const metadata = await sharp(inputPath).metadata();
            const inputSize = (await fs.stat(inputPath)).size;
            stats.totalSizeBefore += inputSize;
            
            // Procesar cada tamaño
            for (const [sizeName, sizeConfig] of Object.entries(this.config.SIZES)) {
                await this.processSize(inputPath, basename, sizeName, sizeConfig, metadata);
            }
            
            // Generar blurhash si está habilitado
            if (this.config.OPTIMIZATION.generateBlurhash) {
                const blurhash = await this.generateBlurhash(inputPath);
                this.addToManifest(basename, 'blurhash', blurhash);
            }
            
            // Generar LQIP si está habilitado
            if (this.config.OPTIMIZATION.generateLQIP) {
                await this.generateLQIP(inputPath, basename);
            }
            
            stats.processedImages++;
            spinner.text = `Procesando imágenes... (${stats.processedImages}/${stats.totalImages})`;
            
        } catch (error) {
            stats.errors.push({ file: filename, error: error.message });
            console.error(chalk.red(`Error procesando ${filename}:`, error.message));
        }
    }

    /**
     * Procesar un tamaño específico
     */
    async processSize(inputPath, basename, sizeName, sizeConfig, metadata) {
        const { width, height, quality } = sizeConfig;
        
        // Calcular dimensiones manteniendo aspect ratio
        let finalWidth = width;
        let finalHeight = height;
        
        if (metadata.width && metadata.height) {
            const aspectRatio = metadata.width / metadata.height;
            const targetRatio = width / height;
            
            if (aspectRatio > targetRatio) {
                finalHeight = Math.round(width / aspectRatio);
            } else {
                finalWidth = Math.round(height * aspectRatio);
            }
        }
        
        // Procesar cada formato
        for (const format of this.config.FORMATS) {
            const outputFilename = `${basename}_${width}x${height}.${format}`;
            const outputPath = path.join(this.config.OUTPUT_DIR, `${sizeName}s`, outputFilename);
            
            try {
                // Redimensionar y optimizar
                let pipeline = sharp(inputPath)
                    .resize(finalWidth, finalHeight, {
                        fit: 'cover',
                        position: 'center',
                        withoutEnlargement: true
                    });
                
                // Aplicar formato específico
                if (format === 'webp') {
                    pipeline = pipeline.webp({
                        quality: this.config.QUALITY.webp,
                        effort: 6
                    });
                } else if (format === 'jpg' || format === 'jpeg') {
                    pipeline = pipeline.jpeg({
                        quality: this.config.QUALITY.jpg,
                        progressive: this.config.OPTIMIZATION.progressive,
                        mozjpeg: this.config.OPTIMIZATION.mozjpeg
                    });
                } else if (format === 'png') {
                    pipeline = pipeline.png({
                        quality: this.config.QUALITY.png,
                        compressionLevel: 9,
                        progressive: this.config.OPTIMIZATION.progressive
                    });
                }
                
                // Eliminar metadata si está configurado
                if (this.config.OPTIMIZATION.strip) {
                    pipeline = pipeline.withMetadata({
                        exif: false,
                        icc: false,
                        iptc: false,
                        xmp: false
                    });
                }
                
                // Guardar
                const info = await pipeline.toFile(outputPath);
                stats.totalSizeAfter += info.size;
                
                // Agregar al manifiesto
                this.addToManifest(basename, sizeName, {
                    format,
                    path: outputPath.replace(this.config.OUTPUT_DIR, ''),
                    width: info.width,
                    height: info.height,
                    size: info.size
                });
                
            } catch (error) {
                console.error(chalk.red(`Error generando ${outputFilename}:`, error.message));
            }
        }
    }

    /**
     * Generar Blurhash
     */
    async generateBlurhash(inputPath) {
        try {
            // Importar dinámicamente blurhash
            const { encode } = await import('blurhash');
            
            // Redimensionar imagen a tamaño pequeño para blurhash
            const { data, info } = await sharp(inputPath)
                .resize(32, 32, { fit: 'inside' })
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            
            // Generar blurhash
            const blurhash = encode(
                new Uint8ClampedArray(data),
                info.width,
                info.height,
                4,
                4
            );
            
            return blurhash;
            
        } catch (error) {
            console.warn('No se pudo generar blurhash:', error.message);
            return null;
        }
    }

    /**
     * Generar LQIP (Low Quality Image Placeholder)
     */
    async generateLQIP(inputPath, basename) {
        const outputPath = path.join(
            this.config.OUTPUT_DIR,
            'placeholders',
            `${basename}_lqip.jpg`
        );
        
        try {
            await sharp(inputPath)
                .resize(40, 60, { fit: 'inside' })
                .blur(5)
                .jpeg({ quality: 20 })
                .toFile(outputPath);
                
            const { size } = await fs.stat(outputPath);
            
            this.addToManifest(basename, 'lqip', {
                path: outputPath.replace(this.config.OUTPUT_DIR, ''),
                size
            });
            
        } catch (error) {
            console.warn('No se pudo generar LQIP:', error.message);
        }
    }

    /**
     * Generar sprites para preview de video
     */
    async generateSprites() {
        // Aquí se generarían sprites para preview de hover
        // Por ahora, crear un sprite de ejemplo
        
        const spriteWidth = 160;
        const spriteHeight = 90;
        const cols = 10;
        const rows = 10;
        
        const sprite = await sharp({
            create: {
                width: spriteWidth * cols,
                height: spriteHeight * rows,
                channels: 3,
                background: '#333333'
            }
        })
        .jpeg({ quality: 70 })
        .toFile(path.join(this.config.OUTPUT_DIR, 'sprites', 'preview-sprite.jpg'));
        
        console.log(chalk.blue('→ Sprite de preview generado'));
    }

    /**
     * Agregar al manifiesto
     */
    addToManifest(basename, type, data) {
        let image = this.manifest.images.find(img => img.id === basename);
        
        if (!image) {
            image = { id: basename };
            this.manifest.images.push(image);
        }
        
        if (!image[type]) {
            image[type] = data;
        } else if (Array.isArray(image[type])) {
            image[type].push(data);
        } else {
            image[type] = [image[type], data];
        }
    }

    /**
     * Generar manifiesto
     */
    async generateManifest() {
        const manifestPath = path.join(this.config.OUTPUT_DIR, 'manifest.json');
        
        this.manifest.stats = {
            totalImages: stats.totalImages,
            processedImages: stats.processedImages,
            totalSizeBefore: stats.totalSizeBefore,
            totalSizeAfter: stats.totalSizeAfter,
            compressionRatio: ((1 - stats.totalSizeAfter / stats.totalSizeBefore) * 100).toFixed(2),
            errors: stats.errors.length
        };
        
        await fs.writeFile(
            manifestPath,
            JSON.stringify(this.manifest, null, 2),
            'utf8'
        );
        
        console.log(chalk.blue(`→ Manifiesto guardado en ${manifestPath}`));
    }

    /**
     * Imprimir reporte
     */
    printReport() {
        const duration = ((stats.endTime - stats.startTime) / 1000).toFixed(2);
        const compressionRatio = ((1 - stats.totalSizeAfter / stats.totalSizeBefore) * 100).toFixed(2);
        
        console.log('\n' + chalk.cyan('═'.repeat(60)));
        console.log(chalk.cyan.bold('🖼️  REPORTE DE OPTIMIZACIÓN DE IMÁGENES'));
        console.log(chalk.cyan('═'.repeat(60)));
        
        console.log(chalk.white(`
  ${chalk.bold('Imágenes procesadas:')}  ${chalk.green(stats.processedImages + '/' + stats.totalImages)}
  ${chalk.bold('Tamaño original:')}      ${chalk.yellow(this.formatBytes(stats.totalSizeBefore))}
  ${chalk.bold('Tamaño optimizado:')}    ${chalk.green(this.formatBytes(stats.totalSizeAfter))}
  ${chalk.bold('Reducción:')}            ${chalk.green(compressionRatio + '%')}
  ${chalk.bold('Tiempo de proceso:')}    ${chalk.blue(duration + 's')}
  ${chalk.bold('Errores:')}              ${stats.errors.length > 0 ? chalk.red(stats.errors.length) : chalk.green('0')}
        `));
        
        if (stats.errors.length > 0) {
            console.log(chalk.red('\n  Errores:'));
            stats.errors.forEach(err => {
                console.log(chalk.red(`    - ${err.file}: ${err.error}`));
            });
        }
        
        console.log(chalk.cyan('═'.repeat(60)) + '\n');
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

// Función principal
async function main() {
    console.log(chalk.cyan.bold('\n🖼️  TV Cinema - Optimizador de Imágenes\n'));
    
    const optimizer = new ImageOptimizer(CONFIG);
    await optimizer.run();
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

export default ImageOptimizer;

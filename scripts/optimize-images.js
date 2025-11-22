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
                    

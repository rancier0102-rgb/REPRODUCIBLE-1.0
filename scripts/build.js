#!/usr/bin/env node

/**
 * Build Script Principal
 * Orquesta todo el proceso de build para producción
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';
import { createHash } from 'crypto';
import CleanCSS from 'clean-css';
import htmlMinifier from 'html-minifier-terser';

// Importar otros scripts
import ChunkGenerator from './generate-chunks.js';
import ImageOptimizer from './optimize-images.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// Configuración de build
const BUILD_CONFIG = {
    MODE: process.env.NODE_ENV || 'production',
    OUTPUT_DIR: path.join(ROOT_DIR, 'dist'),
    PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
    
    // Opciones de minificación
    MINIFY: {
        js: true,
        css: true,
        html: true,
        images: true
    },
    
    // Opciones de bundle
    BUNDLE: {
        splitting: true,
        treeshake: true,
        sourcemap: false,
        target: ['es2018', 'chrome58', 'firefox57', 'safari11', 'edge16']
    },
    
    // Hashing para cache busting
    USE_HASH: true,
    
    // Compresión
    COMPRESSION: {
        brotli: true,
        gzip: true
    },
    
    // Service Worker
    GENERATE_SW: true,
    
    // Análisis de bundle
    ANALYZE: false
};

// Estadísticas de build
const buildStats = {
    startTime: 0,
    endTime: 0,
    steps: [],
    errors: [],
    warnings: [],
    outputSize: 0,
    files: []
};

/**
 * Clase principal de Build
 */
class Builder {
    constructor(config) {
        this.config = config;
        this.manifest = {};
        this.fileHashes = new Map();
    }

    /**
     * Ejecutar build completo
     */
    async run() {
        buildStats.startTime = performance.now();
        
        console.log(chalk.cyan.bold('\n🚀 TV Cinema - Build de Producción\n'));
        console.log(chalk.gray(`Modo: ${this.config.MODE}`));
        console.log(chalk.gray(`Output: ${this.config.OUTPUT_DIR}\n`));
        
        const steps = [
            { name: 'Limpiar directorio', fn: () => this.clean() },
            { name: 'Copiar archivos públicos', fn: () => this.copyPublic() },
            { name: 'Generar chunks de datos', fn: () => this.generateChunks() },
            { name: 'Optimizar imágenes', fn: () => this.optimizeImages() },
            { name: 'Compilar JavaScript', fn: () => this.buildJavaScript() },
            { name: 'Compilar CSS', fn: () => this.buildCSS() },
            { name: 'Procesar HTML', fn: () => this.processHTML() },
            { name: 'Generar Service Worker', fn: () => this.generateServiceWorker() },
            { name: 'Generar manifest.json', fn: () => this.generateManifest() },
            { name: 'Comprimir archivos', fn: () => this.compressFiles() },
            { name: 'Generar reporte', fn: () => this.generateReport() }
        ];
        
        for (const step of steps) {
            const spinner = ora(step.name).start();
            const stepStart = performance.now();
            
            try {
                await step.fn();
                const stepTime = ((performance.now() - stepStart) / 1000).toFixed(2);
                spinner.succeed(chalk.green(`✓ ${step.name} (${stepTime}s)`));
                
                buildStats.steps.push({
                    name: step.name,
                    success: true,
                    time: stepTime
                });
                
            } catch (error) {
                spinner.fail(chalk.red(`✗ ${step.name}`));
                console.error(chalk.red(error));
                
                buildStats.steps.push({
                    name: step.name,
                    success: false,
                    error: error.message
                });
                
                if (this.config.MODE === 'production') {
                    process.exit(1);
                }
            }
        }
        
        buildStats.endTime = performance.now();
        this.printSummary();
    }

    /**
     * Limpiar directorio de salida
     */
    async clean() {
        await fs.rm(this.config.OUTPUT_DIR, { recursive: true, force: true });
        await fs.mkdir(this.config.OUTPUT_DIR, { recursive: true });
    }

    /**
     * Copiar archivos públicos
     */
    async copyPublic() {
        const publicFiles = [
            'robots.txt',
            'sitemap.xml',
            'favicon.ico',
            '.well-known'
        ];
        
        for (const file of publicFiles) {
            const src = path.join(ROOT_DIR, file);
            const dest = path.join(this.config.OUTPUT_DIR, file);
            
            try {
                const stats = await fs.stat(src);
                if (stats.isDirectory()) {
                    await this.copyDirectory(src, dest);
                } else {
                    await fs.copyFile(src, dest);
                }
            } catch (error) {
                // Archivo no existe, continuar
            }
        }
    }

    /**
     * Copiar directorio recursivamente
     */
    async copyDirectory(src, dest) {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }

    /**
     * Generar chunks de datos
     */
    async generateChunks() {
        const generator = new ChunkGenerator({
            DATA_DIR: path.join(ROOT_DIR, 'data/movies'),
            OUTPUT_DIR: path.join(this.config.OUTPUT_DIR, 'data/movies'),
            CHUNK_SIZE: 50,
            PRETTY_PRINT: this.config.MODE !== 'production'
        });
        
        await generator.run();
    }

    /**
     * Optimizar imágenes
     */
    async optimizeImages() {
        if (!this.config.MINIFY.images) {
            console.log(chalk.gray('  Saltando optimización de imágenes'));
            return;
        }
        
        const optimizer = new ImageOptimizer({
            INPUT_DIR: path.join(ROOT_DIR, 'assets/images/original'),
            OUTPUT_DIR: path.join(this.config.OUTPUT_DIR, 'images'),
            CONCURRENT_LIMIT: 4
        });
        
        await optimizer.run();
    }

    /**
     * Compilar JavaScript con esbuild
     */
    async buildJavaScript() {
        const entryPoints = [
            path.join(ROOT_DIR, 'js/app.js'),
            path.join(ROOT_DIR, 'js/player.js'),
            path.join(ROOT_DIR, 'js/navigation.js'),
            path.join(ROOT_DIR, 'js/cache.js')
        ];
        
        const result = await esbuild.build({
            entryPoints,
            bundle: true,
            splitting: this.config.BUNDLE.splitting,
            format: 'esm',
            target: this.config.BUNDLE.target,
            minify: this.config.MINIFY.js,
            treeShaking: this.config.BUNDLE.treeshake,
            sourcemap: this.config.BUNDLE.sourcemap,
            metafile: true,
            outdir: path.join(this.config.OUTPUT_DIR, 'js'),
            chunkNames: this.config.USE_HASH ? '[name]-[hash]' : '[name]',
            assetNames: '[name]-[hash]',
            loader: {
                '.js': 'js',
                '.json': 'json'
            },
            define: {
                'process.env.NODE_ENV': JSON.stringify(this.config.MODE)
            },
            external: ['fs', 'path', 'crypto']
        });
        
        // Guardar metafile para análisis
        if (this.config.ANALYZE) {
            await fs.writeFile(
                path.join(this.config.OUTPUT_DIR, 'meta.json'),
                JSON.stringify(result.metafile),
                'utf8'
            );
        }
        
        // Actualizar manifest con hashes
        for (const [output, data] of Object.entries(result.metafile.outputs)) {
            if (output.endsWith('.js')) {
                const name = path.basename(output);
                this.fileHashes.set(name, this.generateHash(name));
            }
        }
    }

    /**
     * Compilar CSS
     */
    async buildCSS() {
        const cssFiles = [
            'css/tv-layout.css',
            'css/animations.css',
            'css/themes/dark.css',
            'css/themes/light.css'
        ];
        
        for (const file of cssFiles) {
            const inputPath = path.join(ROOT_DIR, file);
            const outputPath = path.join(this.config.OUTPUT_DIR, file);
            
            // Crear directorio si no existe
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            
            // Leer CSS
            const css = await fs.readFile(inputPath, 'utf8');
            
            // Minificar si está habilitado
            let output = css;
            if (this.config.MINIFY.css) {
                const cleanCSS = new CleanCSS({
                    level: 2,
                    compatibility: 'ie11'
                });
                const result = cleanCSS.minify(css);
                output = result.styles;
            }
            
            // Agregar hash si está habilitado
            if (this.config.USE_HASH) {
                const hash = this.generateHash(output);
                const hashedPath = outputPath.replace('.css', `-${hash}.css`);
                await fs.writeFile(hashedPath, output, 'utf8');
                this.fileHashes.set(file, hash);
            } else {
                await fs.writeFile(outputPath, output, 'utf8');
            }
        }
    }

    /**
     * Procesar HTML
     */
    async processHTML() {
        const htmlPath = path.join(ROOT_DIR, 'index.html');
        let html = await fs.readFile(htmlPath, 'utf8');
        
        // Reemplazar referencias con hashes
        if (this.config.USE_HASH) {
            for (const [file, hash] of this.fileHashes) {
                const ext = path.extname(file);
                const hashedFile = file.replace(ext, `-${hash}${ext}`);
                html = html.replace(new RegExp(file, 'g'), hashedFile);
            }
        }
        
        // Minificar si está habilitado
        if (this.config.MINIFY.html) {
            html = await htmlMinifier.minify(html, {
                collapseWhitespace: true,
                removeComments: true,
                removeRedundantAttributes: true,
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true,
                useShortDoctype: true,
                minifyCSS: true,
                minifyJS: true
            });
        }
        
        // Guardar HTML procesado
        await fs.writeFile(
            path.join(this.config.OUTPUT_DIR, 'index.html'),
            html,
            'utf8'
        );
    }

    /**
     * Generar Service Worker
     */
    async generateServiceWorker() {
        if (!this.config.GENERATE_SW) {
            return;
        }
        
        const swPath = path.join(ROOT_DIR, 'workers/service-worker.js');
        let swContent = await fs.readFile(swPath, 'utf8');
        
        // Actualizar versión y timestamp
        swContent = swContent.replace(
            /const CACHE_VERSION = '[^']+'/,
            `const CACHE_VERSION = 'v${Date.now()}'`
        );
        
        // Minificar si está habilitado
        if (this.config.MINIFY.js) {
            const result = await esbuild.transform(swContent, {
                minify: true,
                target: 'es2018'
            });
            swContent = result.code;
        }
        
        await fs.writeFile(
            path.join(this.config.OUTPUT_DIR, 'sw.js'),
            swContent,
            'utf8'
        );
    }

    /**
     * Generar manifest.json
     */
    async generateManifest() {
        const manifestPath = path.join(ROOT_DIR, 'manifest.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        
        // Actualizar versión
        manifest.version = process.env.npm_package_version || '1.0.0';
        manifest.build_date = new Date().toISOString();
        
        await fs.writeFile(
            path.join(this.config.OUTPUT_DIR, 'manifest.json'),
            JSON.stringify(manifest, null, this.config.MODE === 'production' ? 0 : 2),
            'utf8'
        );
    }

    /**
     * Comprimir archivos
     */
    async compressFiles() {
        if (!this.config.COMPRESSION.gzip && !this.config.COMPRESSION.brotli) {
            return;
        }
        
        const { promisify } = await import('util');
        const zlib = await import('zlib');
        const gzip = promisify(zlib.gzip);
        const brotli = promisify(zlib.brotliCompress);
        
        const files = await this.getFilesToCompress();
        
        for (const file of files) {
            const content = await fs.readFile(file);
            
            if (this.config.COMPRESSION.gzip) {
                const compressed = await gzip(content);
                await fs.writeFile(`${file}.gz`, compressed);
            }
            
            if (this.config.COMPRESSION.brotli) {
                const compressed = await brotli(content);
                await fs.writeFile(`${file}.br`, compressed);
            }
        }
    }

    /**
     * Obtener archivos para comprimir
     */
    async getFilesToCompress() {
        const extensions = ['.html', '.css', '.js', '.json', '.svg', '.xml'];
        const files = [];
        
        const scanDir = async (dir) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    await scanDir(fullPath);
                } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        };
        
        await scanDir(this.config.OUTPUT_DIR);
        return files;
    }

    /**
     * Generar reporte de build
     */
    async generateReport() {
        const report = {
            ...buildStats,
            config: this.config,
            outputSize: await this.calculateDirSize(this.config.OUTPUT_DIR),
            files: await this.getOutputFiles()
        };
        
        await fs.writeFile(
            path.join(this.config.OUTPUT_DIR, 'build-report.json'),
            JSON.stringify(report, null, 2),
            'utf8'
        );
    }

    /**
     * Calcular tamaño de directorio
     */
    async calculateDirSize(dir) {
        let size = 0;
        
        const scanDir = async (dirPath) => {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    await scanDir(fullPath);
                } else {
                    const stats = await fs.stat(fullPath);
                    size += stats.size;
                }
            }
        };
        
        await scanDir(dir);
        return size;
    }

    /**
     * Obtener lista de archivos de salida
     */
    async getOutputFiles() {
        const files = [];
        
        const scanDir = async (dir, basePath = '') => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const relativePath = path.join(basePath, entry.name);
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    await scanDir(fullPath, relativePath);
                } else {
                    const stats = await fs.stat(fullPath);
                    files.push({
                        path: relativePath,
                        size: stats.size
                    });
                }
            }
        };
        
        await scanDir(this.config.OUTPUT_DIR);
        return files;
    }

    /**
     * Generar hash para cache busting
     */
    generateHash(content) {
        return createHash('sha256')
            .update(content)
            .digest('hex')
            .substring(0, 8);
    }

    /**
     * Imprimir resumen
     */
    printSummary() {
        const duration = ((buildStats.endTime - buildStats.startTime) / 1000).toFixed(2);
        
        console.log('\n' + chalk.cyan('═'.repeat(60)));
        console.log(chalk.cyan.bold('📦 RESUMEN DE BUILD'));
        console.log(chalk.cyan('═'.repeat(60)));
        
        // Pasos completados
        console.log(chalk.white('\n  Pasos:'));
        buildStats.steps.forEach(step => {
            const icon = step.success ? chalk.green('✓') : chalk.red('✗');
            const time = step.time ? chalk.gray(` (${step.time}s)`) : '';
            console.log(`    ${icon} ${step.name}${time}`);
        });
        
        // Estadísticas
        console.log(chalk.white('\n  Estadísticas:'));
        console.log(`    ${chalk.bold('Tiempo total:')}     ${chalk.blue(duration + 's')}`);
        console.log(`    ${chalk.bold('Tamaño output:')}    ${chalk.green(this.formatBytes(buildStats.outputSize))}`);
        console.log(`    ${chalk.bold('Archivos:')}         ${chalk.green(buildStats.files.length)}`);
        
        if (buildStats.warnings.length > 0) {
            console.log(`    ${chalk.bold('Advertencias:')}     ${chalk.yellow(buildStats.warnings.length)}`);
        }
        
        if (buildStats.errors.length > 0) {
            console.log(`    ${chalk.bold('Errores:')}          ${chalk.red(buildStats.errors.length)}`);
        }
        
        console.log(chalk.cyan('═'.repeat(60)));
        console.log(chalk.green.bold('\n✨ Build completado exitosamente!\n'));
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
    const builder = new Builder(BUILD_CONFIG);
    await builder.run();
}

// Manejo de errores
process.on('unhandledRejection', (error) => {
    console.error(chalk.red('Error no manejado:'), error);
    process.exit(1);
});

// Ejecutar
main();

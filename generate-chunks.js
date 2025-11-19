#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================
// CONFIGURACIÓN DEL GENERADOR
// ============================================
const CONFIG = {
  // Directorios
  INPUT_DIR: './data',              // Carpeta con los JSONs originales
  OUTPUT_DIR: './chunks',           // Carpeta donde se guardarán los chunks
  INDEXES_DIR: './chunks/indexes',  // Carpeta para índices especiales
  
  // Información del repositorio (actualizar si es necesario)
  REPOSITORY: {
    user: 'rancier0102-rgb',           // <-- CAMBIAR
    repo: 'REPRODUCIBLE-1.0',       // <-- CAMBIAR
    branch: 'main'
  },
  
  // Estrategia de chunks
  CHUNKS_STRATEGY: {
    // Definición de períodos
    periods: [
      { id: 'latest', name: 'Últimos Estrenos', years: [2025, 2024, 2023], priority: 1 },
      { id: 'recent', name: 'Recientes', years: [2022, 2021, 2020], priority: 2 },
      { id: '2010s', name: 'Década 2010', years: [2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010], priority: 3 },
      { id: '2000s', name: 'Década 2000', years: [2009, 2008, 2007, 2006, 2005, 2004, 2003, 2002, 2001, 2000], priority: 4 },
      { id: '90s', name: 'Años 90', years: [1999, 1998, 1997, 1996, 1995, 1994, 1993, 1992, 1991, 1990], priority: 5 },
      { id: '80s', name: 'Años 80', years: [1989, 1988, 1987, 1986, 1985, 1984, 1983, 1982, 1981, 1980], priority: 6 },
      { id: 'classics', name: 'Clásicas', years: 'rest', priority: 7 }
    ],
    
    // Tamaño máximo por chunk (KB)
    maxChunkSize: 500,
    
    // Generar índices especiales
    generateIndexes: true,
    indexes: [
      { 
        id: 'popular', 
        name: 'Populares',
        filter: (movie) => {
          const rating = parseFloat(movie.rating || movie.puntuacion || 0);
          return rating >= 7;
        },
        limit: 500
      },
      { 
        id: 'hd', 
        name: 'Alta Calidad',
        filter: (movie) => {
          const quality = (movie.quality || movie.calidad || '').toLowerCase();
          return quality.includes('hd') || quality.includes('4k') || quality.includes('1080');
        },
        limit: 500
      },
      {
        id: 'recent-added',
        name: 'Agregadas Recientemente',
        filter: (movie) => true,
        sort: (a, b) => (b.added || 0) - (a.added || 0),
        limit: 100
      }
    ]
  },
  
  // Opciones de optimización
  OPTIMIZATION: {
    minifyJson: true,          // Minificar JSON
    compressFields: true,      // Usar nombres cortos para campos
    removeNulls: true,         // Eliminar valores null/undefined
    deduplicateMovies: true,   // Eliminar películas duplicadas
    sortMovies: true,          // Ordenar películas
    generateChecksums: true,   // Generar checksums MD5
    
    // Mapeo de campos para compresión
    fieldMap: {
      'titulo': 't',
      'title': 't',
      'enlace': 'l',
      'link': 'l',
      'url': 'l',
      'year': 'y',
      'ano': 'y',
      'año': 'y',
      'poster': 'p',
      'imagen': 'p',
      'image': 'p',
      'genero': 'g',
      'genre': 'g',
      'categoria': 'g',
      'quality': 'q',
      'calidad': 'q',
      'rating': 'r',
      'puntuacion': 'r',
      'duration': 'd',
      'duracion': 'd'
    }
  }
};

// ============================================
// CLASE GENERADORA DE CHUNKS
// ============================================
class ChunkGenerator {
  constructor() {
    this.allMovies = [];
    this.chunks = {};
    this.manifest = {
      version: '2.0.0',
      generated: new Date().toISOString(),
      repository: CONFIG.REPOSITORY,
      statistics: {
        totalMovies: 0,
        totalSize: 0,
        totalSizeKB: 0,
        totalSizeMB: 0,
        years: {
          newest: 0,
          oldest: 9999,
          count: 0
        },
        genres: {},
        qualities: {}
      },
      chunks: [],
      indexes: [],
      config: {
        chunkStrategy: 'byPeriod',
        maxChunkSize: CONFIG.CHUNKS_STRATEGY.maxChunkSize,
        minified: CONFIG.OPTIMIZATION.minifyJson,
        compressed: CONFIG.OPTIMIZATION.compressFields
      }
    };
    
    this.duplicatesRemoved = 0;
    this.filesProcessed = 0;
  }
  
  async generate() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║     🚀 GENERADOR DE CHUNKS PARA MOVIES+       ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    try {
      // Paso 1: Cargar películas
      await this.loadAllMovies();
      
      if (this.allMovies.length === 0) {
        throw new Error('No se encontraron películas para procesar');
      }
      
      // Paso 2: Procesar y optimizar
      this.processMovies();
      
      // Paso 3: Generar estadísticas
      this.generateStatistics();
      
      // Paso 4: Crear chunks por período
      this.createChunksByPeriod();
      
      // Paso 5: Crear índices especiales
      if (CONFIG.CHUNKS_STRATEGY.generateIndexes) {
        this.createSpecialIndexes();
      }
      
      // Paso 6: Optimizar tamaño de chunks
      this.optimizeChunkSizes();
      
      // Paso 7: Guardar todo
      await this.saveAllFiles();
      
      // Paso 8: Mostrar resumen
      this.printSummary();
      
    } catch (error) {
      console.error('\n❌ ERROR:', error.message);
      process.exit(1);
    }
  }
  
  async loadAllMovies() {
    console.log('📥 CARGANDO ARCHIVOS JSON...\n');
    
    // Buscar archivos JSON
    let jsonFiles = [];
    
    // Primero buscar en el directorio data/
    if (fs.existsSync(CONFIG.INPUT_DIR)) {
      const dataFiles = fs.readdirSync(CONFIG.INPUT_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(CONFIG.INPUT_DIR, f));
      jsonFiles.push(...dataFiles);
    }
    
    // También buscar en la raíz archivos peliculas_*.json
    const rootFiles = fs.readdirSync('.')
      .filter(f => f.match(/^peliculas_\d{4}\.json$/))
      .map(f => path.join('.', f));
    jsonFiles.push(...rootFiles);
    
    // Eliminar duplicados
    jsonFiles = [...new Set(jsonFiles)];
    
    if (jsonFiles.length === 0) {
      throw new Error('No se encontraron archivos JSON de películas');
    }
    
    console.log(`Encontrados ${jsonFiles.length} archivos para procesar:\n`);
    
    // Procesar cada archivo
    for (const filePath of jsonFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fileName = path.basename(filePath);
        
        // Extraer año del nombre del archivo
        const yearMatch = fileName.match(/(\d{4})/);
        const defaultYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
        
        // Parsear JSON
        let data;
        try {
          data = JSON.parse(content);
        } catch (parseError) {
          console.error(`  ✗ Error parseando ${fileName}:`, parseError.message);
          continue;
        }
        
        // Normalizar formato
        let movies = [];
        if (Array.isArray(data)) {
          movies = data;
        } else if (data.peliculas && Array.isArray(data.peliculas)) {
          movies = data.peliculas;
        } else if (data.movies && Array.isArray(data.movies)) {
          movies = data.movies;
        } else if (data.titulo || data.title) {
          movies = [data];
        }
        
        // Agregar año por defecto si no existe
        movies.forEach(movie => {
          if (!movie.year && !movie.ano && !movie.año) {
            movie.year = defaultYear;
          }
          // Agregar timestamp de agregado
          if (!movie.added) {
            movie.added = Date.now() - Math.random() * 86400000; // Random en últimas 24h
          }
        });
        
        this.allMovies.push(...movies);
        this.filesProcessed++;
        
        const size = Buffer.byteLength(content, 'utf8');
        console.log(`  ✓ ${fileName}: ${movies.length} películas (${(size/1024).toFixed(1)} KB)`);
        
      } catch (error) {
        console.error(`  ✗ Error procesando ${path.basename(filePath)}:`, error.message);
      }
    }
    
    console.log(`\n📊 Total cargado: ${this.allMovies.length} películas de ${this.filesProcessed} archivos\n`);
  }
  
  processMovies() {
    console.log('⚙️  PROCESANDO Y OPTIMIZANDO...\n');
    
    const originalCount = this.allMovies.length;
    
    // Eliminar duplicados
    if (CONFIG.OPTIMIZATION.deduplicateMovies) {
      const uniqueMap = new Map();
      
      this.allMovies.forEach(movie => {
        // Crear clave única basada en título y año
        const titulo = (movie.titulo || movie.title || '').toLowerCase().trim();
        const year = movie.year || movie.ano || movie.año || 0;
        const key = `${titulo}_${year}`;
        
        if (!uniqueMap.has(key) || !uniqueMap.get(key).poster) {
          // Preferir película con poster
          uniqueMap.set(key, movie);
        }
      });
      
      this.allMovies = Array.from(uniqueMap.values());
      this.duplicatesRemoved = originalCount - this.allMovies.length;
      
      if (this.duplicatesRemoved > 0) {
        console.log(`  ✓ Duplicados eliminados: ${this.duplicatesRemoved}`);
      }
    }
    
    // Comprimir campos
    if (CONFIG.OPTIMIZATION.compressFields) {
      this.allMovies = this.allMovies.map(movie => this.compressMovieFields(movie));
      console.log('  ✓ Campos comprimidos');
    }
    
    // Ordenar películas
    if (CONFIG.OPTIMIZATION.sortMovies) {
      this.allMovies.sort((a, b) => {
        const yearA = this.getMovieYear(a);
        const yearB = this.getMovieYear(b);
        
        if (yearB !== yearA) return yearB - yearA;
        
        const titleA = this.getMovieTitle(a);
        const titleB = this.getMovieTitle(b);
        
        return titleA.localeCompare(titleB, 'es');
      });
      console.log('  ✓ Películas ordenadas por año y título');
    }
    
    // Limpiar campos nulos
    if (CONFIG.OPTIMIZATION.removeNulls) {
      let nullsRemoved = 0;
      this.allMovies = this.allMovies.map(movie => {
        const cleaned = {};
        Object.keys(movie).forEach(key => {
          if (movie[key] !== null && movie[key] !== undefined && movie[key] !== '') {
            cleaned[key] = movie[key];
          } else {
            nullsRemoved++;
          }
        });
        return cleaned;
      });
      
      if (nullsRemoved > 0) {
        console.log(`  ✓ Campos vacíos eliminados: ${nullsRemoved}`);
      }
    }
    
    console.log(`\n✅ Películas procesadas: ${this.allMovies.length}`);
  }
  
  compressMovieFields(movie) {
    if (!CONFIG.OPTIMIZATION.compressFields) return movie;
    
    const compressed = {};
    const fieldMap = CONFIG.OPTIMIZATION.fieldMap;
    
    Object.keys(movie).forEach(key => {
      const lowerKey = key.toLowerCase();
      const mappedKey = fieldMap[lowerKey] || key;
      
      // Evitar sobrescribir si ya existe
      if (!compressed[mappedKey]) {
        compressed[mappedKey] = movie[key];
      }
    });
    
    // Asegurar campos esenciales
    if (!compressed.t) {
      compressed.t = movie.titulo || movie.title || 'Sin título';
    }
    if (!compressed.l) {
      compressed.l = movie.enlace || movie.link || movie.url || '#';
    }
    if (!compressed.y) {
      compressed.y = movie.year || movie.ano || movie.año || new Date().getFullYear();
    }
    
    return compressed;
  }
  
  getMovieYear(movie) {
    return movie.y || movie.year || movie.ano || movie.año || 2000;
  }
  
  getMovieTitle(movie) {
    return movie.t || movie.titulo || movie.title || '';
  }
  
  generateStatistics() {
    console.log('\n📊 GENERANDO ESTADÍSTICAS...\n');
    
    const years = new Set();
    const genres = {};
    const qualities = {};
    
    this.allMovies.forEach(movie => {
      // Años
      const year = this.getMovieYear(movie);
      years.add(year);
      
      // Géneros
      const genre = movie.g || movie.genero || movie.genre || 'Sin categoría';
      genres[genre] = (genres[genre] || 0) + 1;
      
      // Calidades
      const quality = movie.q || movie.quality || movie.calidad || 'SD';
      qualities[quality] = (qualities[quality] || 0) + 1;
    });
    
    const sortedYears = Array.from(years).sort();
    
    this.manifest.statistics = {
      totalMovies: this.allMovies.length,
      totalSize: 0, // Se actualizará al guardar
      totalSizeKB: 0,
      totalSizeMB: 0,
      years: {
        newest: sortedYears[sortedYears.length - 1] || 0,
        oldest: sortedYears[0] || 0,
        count: sortedYears.length,
        list: sortedYears
      },
      genres: genres,
      qualities: qualities,
      averagePerYear: Math.round(this.allMovies.length / sortedYears.length)
    };
    
    console.log(`  ✓ Años: ${this.manifest.statistics.years.oldest} - ${this.manifest.statistics.years.newest}`);
    console.log(`  ✓ Géneros únicos: ${Object.keys(genres).length}`);
    console.log(`  ✓ Promedio por año: ${this.manifest.statistics.averagePerYear} películas`);
  }
  
  createChunksByPeriod() {
    console.log('\n📦 CREANDO CHUNKS POR PERÍODO...\n');
    
    const usedYears = new Set();
    
    CONFIG.CHUNKS_STRATEGY.periods.forEach(period => {
      if (period.years === 'rest') {
        // Agregar todos los años no utilizados
        const restMovies = this.allMovies.filter(movie => {
          const year = this.getMovieYear(movie);
          return !usedYears.has(year);
        });
        
        if (restMovies.length > 0) {
          this.chunks[period.id] = {
            ...period,
            movies: restMovies,
            count: restMovies.length
          };
          console.log(`  ✓ ${period.name}: ${restMovies.length} películas`);
        }
      } else {
        // Años específicos
        const periodMovies = this.allMovies.filter(movie => {
          const year = this.getMovieYear(movie);
          return period.years.includes(year);
        });
        
        period.years.forEach(year => usedYears.add(year));
        
        if (periodMovies.length > 0) {
          this.chunks[period.id] = {
            ...period,
            movies: periodMovies,
            count: periodMovies.length
          };
          console.log(`  ✓ ${period.name}: ${periodMovies.length} películas`);
        }
      }
    });
  }
  
  createSpecialIndexes() {
    console.log('\n🔍 CREANDO ÍNDICES ESPECIALES...\n');
    
    CONFIG.CHUNKS_STRATEGY.indexes.forEach(index => {
      let filtered = this.allMovies.filter(index.filter);
      
      // Aplicar ordenamiento si existe
      if (index.sort) {
        filtered.sort(index.sort);
      }
      
      // Aplicar límite si existe
      if (index.limit) {
        filtered = filtered.slice(0, index.limit);
      }
      
      if (filtered.length > 0) {
        this.chunks[`index_${index.id}`] = {
          id: `index_${index.id}`,
          name: index.name,
          movies: filtered,
          count: filtered.length,
          type: 'index',
          priority: 10
        };
        console.log(`  ✓ Índice "${index.name}": ${filtered.length} películas`);
      }
    });
  }
  
  optimizeChunkSizes() {
    console.log('\n📏 OPTIMIZANDO TAMAÑO DE CHUNKS...\n');
    
    const maxSize = CONFIG.CHUNKS_STRATEGY.maxChunkSize * 1024;
    const chunksToSplit = [];
    
    Object.keys(this.chunks).forEach(chunkId => {
      const chunk = this.chunks[chunkId];
      const testJson = JSON.stringify(chunk.movies);
      const size = Buffer.byteLength(testJson, 'utf8');
      
      if (size > maxSize) {
        chunksToSplit.push({ chunkId, chunk, size });
      }
    });
    
    chunksToSplit.forEach(({ chunkId, chunk, size }) => {
      const parts = Math.ceil(size / maxSize);
      const moviesPerPart = Math.ceil(chunk.movies.length / parts);
      
      console.log(`  ⚠️ "${chunk.name}" muy grande (${(size/1024).toFixed(0)} KB)`);
      console.log(`     Dividiendo en ${parts} partes de ~${moviesPerPart} películas cada una`);
      
      for (let i = 0; i < parts; i++) {
        const partMovies = chunk.movies.slice(
          i * moviesPerPart,
          (i + 1) * moviesPerPart
        );
        
        const partId = parts > 1 ? `${chunkId}_part${i + 1}` : chunkId;
        
        this.chunks[partId] = {
          ...chunk,
          id: partId,
          name: parts > 1 ? `${chunk.name} (Parte ${i + 1}/${parts})` : chunk.name,
          movies: partMovies,
          count: partMovies.length,
          part: parts > 1 ? i + 1 : undefined,
          totalParts: parts > 1 ? parts : undefined
        };
      }
      
      // Si se dividió, eliminar el chunk original
      if (parts > 1) {
        delete this.chunks[chunkId];
      }
    });
  }
  
  async saveAllFiles() {
    console.log('\n💾 GUARDANDO ARCHIVOS...\n');
    
    // Crear directorios
    [CONFIG.OUTPUT_DIR, CONFIG.INDEXES_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    let totalSize = 0;
    
    // Guardar cada chunk
    for (const [chunkId, chunk] of Object.entries(this.chunks)) {
      const isIndex = chunk.type === 'index';
      const dir = isIndex ? CONFIG.INDEXES_DIR : CONFIG.OUTPUT_DIR;
      const filename = `${chunkId.replace('index_', '')}.json`;
      const filepath = path.join(dir, filename);
      
      // Preparar datos
      const chunkData = {
        id: chunk.id,
        name: chunk.name,
        generated: new Date().toISOString(),
        count: chunk.count,
        priority: chunk.priority || 99,
        type: chunk.type || 'period'
      };
      
      // Agregar información de partes si existe
      if (chunk.part) {
        chunkData.part = chunk.part;
        chunkData.totalParts = chunk.totalParts;
      }
      
      // Agregar películas
      chunkData.movies = chunk.movies;
      
      // Convertir a JSON
      const json = CONFIG.OPTIMIZATION.minifyJson
        ? JSON.stringify(chunkData)
        : JSON.stringify(chunkData, null, 2);
      
      // Guardar archivo
      fs.writeFileSync(filepath, json);
      
      const size = Buffer.byteLength(json, 'utf8');
      totalSize += size;
      
      // Generar checksum
      let checksum = null;
      if (CONFIG.OPTIMIZATION.generateChecksums) {
        checksum = crypto.createHash('md5').update(json).digest('hex');
      }
      
      // Agregar al manifest
      const manifestEntry = {
        id: chunk.id,
        name: chunk.name,
        file: isIndex ? `chunks/indexes/${filename}` : `chunks/${filename}`,
        size: size,
        sizeKB: parseFloat((size / 1024).toFixed(1)),
        movies: chunk.count,
        priority: chunk.priority || 99,
        type: chunk.type || 'period'
      };
      
      if (checksum) {
        manifestEntry.checksum = checksum;
      }
      
      if (chunk.part) {
        manifestEntry.part = chunk.part;
        manifestEntry.totalParts = chunk.totalParts;
      }
      
      if (isIndex) {
        this.manifest.indexes.push(manifestEntry);
      } else {
        this.manifest.chunks.push(manifestEntry);
      }
      
      console.log(`  ✓ ${filename} (${(size/1024).toFixed(1)} KB) - ${chunk.count} películas`);
    }
    
    // Actualizar estadísticas de tamaño
    this.manifest.statistics.totalSize = totalSize;
    this.manifest.statistics.totalSizeKB = parseFloat((totalSize / 1024).toFixed(1));
    this.manifest.statistics.totalSizeMB = parseFloat((totalSize / 1024 / 1024).toFixed(2));
    
    // Ordenar chunks por prioridad
    this.manifest.chunks.sort((a, b) => a.priority - b.priority);
    
    // Guardar manifest
    const manifestJson = JSON.stringify(this.manifest, null, 2);
    fs.writeFileSync('./manifest.json', manifestJson);
    
    console.log(`\n  ✓ manifest.json guardado (${(Buffer.byteLength(manifestJson) / 1024).toFixed(1)} KB)`);
  }
  
  printSummary() {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║              📊 RESUMEN FINAL                  ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    console.log('ESTADÍSTICAS:');
    console.log('─────────────');
    console.log(`  • Archivos procesados: ${this.filesProcessed}`);
    console.log(`  • Películas totales: ${this.manifest.statistics.totalMovies}`);
    console.log(`  • Duplicados eliminados: ${this.duplicatesRemoved}`);
    console.log(`  • Chunks generados: ${this.manifest.chunks.length}`);
    console.log(`  • Índices especiales: ${this.manifest.indexes.length}`);
    console.log(`  • Tamaño total: ${this.manifest.statistics.totalSizeMB} MB`);
    console.log(`  • Años cubiertos: ${this.manifest.statistics.years.oldest}-${this.manifest.statistics.years.newest}`);
    
    console.log('\nCHUNKS GENERADOS:');
    console.log('─────────────────');
    
    // Tabla de chunks
    const chunkTable = this.manifest.chunks.map(c => ({
      'Archivo': c.file.replace('chunks/', ''),
      'Películas': c.movies,
      'Tamaño': `${c.sizeKB} KB`,
      'Prioridad': c.priority
    }));
    
    console.table(chunkTable);
    
    if (this.manifest.indexes.length > 0) {
      console.log('\nÍNDICES ESPECIALES:');
      console.log('───────────────────');
      
      const indexTable = this.manifest.indexes.map(i => ({
        'Archivo': i.file.replace('chunks/indexes/', ''),
        'Películas': i.movies,
        'Tamaño': `${i.sizeKB} KB`
      }));
      
      console.table(indexTable);
    }
    
    console.log('\n✅ ¡GENERACIÓN COMPLETADA CON ÉXITO!\n');
    console.log('Próximos pasos:');
    console.log('  1. Revisa los archivos generados en la carpeta "chunks/"');
    console.log('  2. Actualiza las URLs en index.html con tu usuario y repositorio');
    console.log('  3. Haz commit y push de todos los archivos a GitHub');
    console.log('  4. ¡Tu aplicación estará lista!\n');
  }
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================
async function main() {
  const generator = new ChunkGenerator();
  await generator.generate();
}

// ============================================
// EJECUCIÓN
// ============================================
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  });
}

module.exports = ChunkGenerator;

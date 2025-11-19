const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================
// CONFIGURACIÓN DE CHUNKS
// ============================================
const CONFIG = {
  INPUT_DIR: './peliculas',        // Carpeta con tus JSONs originales
  OUTPUT_DIR: './chunks',          // Carpeta para los chunks
  MANIFEST_FILE: './manifest.json', // Archivo manifest
  
  // Estrategia de chunks
  CHUNKS_STRATEGY: {
    // Por período de tiempo
    byPeriod: [
      { id: 'latest', name: 'Últimos Estrenos', years: [2025, 2024, 2023], priority: 1 },
      { id: 'recent', name: 'Recientes', years: [2022, 2021, 2020], priority: 2 },
      { id: '2010s', name: 'Década 2010', years: [2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010], priority: 3 },
      { id: '2000s', name: 'Década 2000', years: [2009, 2008, 2007, 2006, 2005, 2004, 2003, 2002, 2001, 2000], priority: 4 },
      { id: '90s', name: 'Años 90', years: [1999, 1998, 1997, 1996, 1995, 1994, 1993, 1992, 1991, 1990], priority: 5 },
      { id: '80s', name: 'Años 80', years: [1989, 1988, 1987, 1986, 1985, 1984, 1983, 1982, 1981, 1980], priority: 6 },
      { id: 'classics', name: 'Clásicas', years: 'rest', priority: 7 }
    ],
    
    // Por tamaño máximo (KB)
    maxChunkSize: 500, // 500KB por chunk máximo
    
    // Generar índices especiales
    generateIndexes: true,
    indexes: [
      { id: 'popular', filter: (movie) => movie.popular || movie.rating > 7 },
      { id: 'hd', filter: (movie) => movie.quality === 'HD' || movie.quality === '4K' },
      { id: 'spanish', filter: (movie) => movie.language === 'es' || movie.audio?.includes('Español') }
    ]
  },
  
  // Optimización
  OPTIMIZATION: {
    minifyJson: true,           // Minificar JSONs
    compressFields: true,       // Comprimir nombres de campos
    removeNulls: true,          // Eliminar campos null
    deduplicateMovies: true,    // Eliminar duplicados
    sortMovies: true,           // Ordenar películas
    generateChecksums: true     // Generar checksums para verificación
  }
};

// ============================================
// GENERADOR DE CHUNKS
// ============================================
class ChunkGenerator {
  constructor() {
    this.allMovies = [];
    this.chunks = {};
    this.manifest = {
      version: '2.0.0',
      generated: new Date().toISOString(),
      totalMovies: 0,
      totalSize: 0,
      chunks: [],
      indexes: [],
      checksums: {}
    };
  }
  
  async generate() {
    console.log('🚀 Iniciando generación de chunks...\n');
    
    // Paso 1: Cargar todos los JSONs
    await this.loadAllMovies();
    
    // Paso 2: Procesar y optimizar
    this.processMovies();
    
    // Paso 3: Crear chunks por período
    this.createChunksByPeriod();
    
    // Paso 4: Crear índices especiales
    if (CONFIG.CHUNKS_STRATEGY.generateIndexes) {
      this.createSpecialIndexes();
    }
    
    // Paso 5: Optimizar chunks por tamaño
    this.optimizeChunkSizes();
    
    // Paso 6: Guardar chunks y manifest
    await this.saveChunks();
    
    console.log('\n✅ Generación completada!');
    this.printStats();
  }
  
  async loadAllMovies() {
    console.log('📥 Cargando archivos JSON...');
    
    // Crear directorio de entrada si no existe
    if (!fs.existsSync(CONFIG.INPUT_DIR)) {
      // Si no existe la carpeta, buscar archivos en la raíz
      const files = fs.readdirSync('.').filter(f => f.match(/peliculas_\d{4}\.json/));
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const year = parseInt(file.match(/\d{4}/)[0]);
          let data = JSON.parse(content);
          
          // Normalizar formato
          if (!Array.isArray(data)) {
            data = data.peliculas || data.movies || [data];
          }
          
          // Agregar año si no existe
          data.forEach(movie => {
            if (!movie.year && !movie.ano) {
              movie.year = year;
            }
          });
          
          this.allMovies.push(...data);
          console.log(`  ✓ ${file}: ${data.length} películas`);
        } catch (error) {
          console.error(`  ✗ Error en ${file}:`, error.message);
        }
      }
    } else {
      // Cargar desde carpeta
      const files = fs.readdirSync(CONFIG.INPUT_DIR).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        const filePath = path.join(CONFIG.INPUT_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        this.allMovies.push(...(Array.isArray(data) ? data : [data]));
        console.log(`  ✓ ${file}: ${Array.isArray(data) ? data.length : 1} películas`);
      }
    }
    
    console.log(`\n📊 Total cargado: ${this.allMovies.length} películas\n`);
  }
  
  processMovies() {
    console.log('⚙️ Procesando películas...');
    
    // Eliminar duplicados
    if (CONFIG.OPTIMIZATION.deduplicateMovies) {
      const before = this.allMovies.length;
      const uniqueMap = new Map();
      
      this.allMovies.forEach(movie => {
        const key = `${movie.titulo}_${movie.year || movie.ano}`.toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, movie);
        }
      });
      
      this.allMovies = Array.from(uniqueMap.values());
      console.log(`  ✓ Duplicados eliminados: ${before - this.allMovies.length}`);
    }
    
    // Optimizar campos
    if (CONFIG.OPTIMIZATION.compressFields) {
      this.allMovies = this.allMovies.map(movie => this.compressMovie(movie));
      console.log('  ✓ Campos comprimidos');
    }
    
    // Ordenar
    if (CONFIG.OPTIMIZATION.sortMovies) {
      this.allMovies.sort((a, b) => {
        const yearA = a.y || a.year || 2000;
        const yearB = b.y || b.year || 2000;
        if (yearB !== yearA) return yearB - yearA;
        return (a.t || a.titulo || '').localeCompare(b.t || b.titulo || '');
      });
      console.log('  ✓ Películas ordenadas');
    }
    
    this.manifest.totalMovies = this.allMovies.length;
  }
  
  compressMovie(movie) {
    // Comprimir nombres de campos para reducir tamaño
    const compressed = {
      t: movie.titulo || movie.title,           // título
      l: movie.enlace || movie.link || movie.url, // link
      y: parseInt(movie.year || movie.ano || 2000), // año
    };
    
    // Campos opcionales
    if (movie.poster) compressed.p = movie.poster;
    if (movie.genre || movie.genero) compressed.g = movie.genre || movie.genero;
    if (movie.quality || movie.calidad) compressed.q = movie.quality || movie.calidad;
    if (movie.rating) compressed.r = parseFloat(movie.rating);
    if (movie.duration) compressed.d = movie.duration;
    
    // Eliminar nulls y undefined
    if (CONFIG.OPTIMIZATION.removeNulls) {
      Object.keys(compressed).forEach(key => {
        if (compressed[key] === null || compressed[key] === undefined || compressed[key] === '') {
          delete compressed[key];
        }
      });
    }
    
    return compressed;
  }
  
  createChunksByPeriod() {
    console.log('📦 Creando chunks por período...');
    
    const usedYears = new Set();
    
    CONFIG.CHUNKS_STRATEGY.byPeriod.forEach(period => {
      if (period.years === 'rest') {
        // Agregar todos los años no usados
        const restMovies = this.allMovies.filter(movie => {
          const year = movie.y || movie.year || 2000;
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
          const year = movie.y || movie.year || 2000;
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
    console.log('\n🔍 Creando índices especiales...');
    
    CONFIG.CHUNKS_STRATEGY.indexes.forEach(index => {
      const filtered = this.allMovies.filter(index.filter);
      
      if (filtered.length > 0) {
        this.chunks[`index_${index.id}`] = {
          id: `index_${index.id}`,
          name: `Índice: ${index.id}`,
          movies: filtered.slice(0, 500), // Limitar a 500 películas
          count: filtered.length,
          type: 'index',
          priority: 10
        };
        console.log(`  ✓ Índice ${index.id}: ${filtered.length} películas`);
      }
    });
  }
  
  optimizeChunkSizes() {
    console.log('\n📏 Optimizando tamaño de chunks...');
    
    const maxSize = CONFIG.CHUNKS_STRATEGY.maxChunkSize * 1024; // Convertir a bytes
    
    Object.keys(this.chunks).forEach(chunkId => {
      const chunk = this.chunks[chunkId];
      const json = JSON.stringify(chunk.movies);
      const size = Buffer.byteLength(json, 'utf8');
      
      if (size > maxSize) {
        // Dividir chunk grande en partes
        const parts = Math.ceil(size / maxSize);
        const moviesPerPart = Math.ceil(chunk.movies.length / parts);
        
        console.log(`  ⚠️ ${chunk.name} muy grande (${(size/1024).toFixed(0)}KB), dividiendo en ${parts} partes`);
        
        for (let i = 0; i < parts; i++) {
          const partMovies = chunk.movies.slice(i * moviesPerPart, (i + 1) * moviesPerPart);
          const partId = `${chunkId}_part${i + 1}`;
          
          this.chunks[partId] = {
            ...chunk,
            id: partId,
            name: `${chunk.name} (Parte ${i + 1}/${parts})`,
            movies: partMovies,
            count: partMovies.length,
            part: i + 1,
            totalParts: parts
          };
        }
        
        // Eliminar chunk original
        delete this.chunks[chunkId];
      }
    });
  }
  
  async saveChunks() {
    console.log('\n💾 Guardando chunks...');
    
    // Crear directorio de salida
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
      fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    }
    
    // Guardar cada chunk
    for (const [chunkId, chunk] of Object.entries(this.chunks)) {
      const filename = `${chunkId}.json`;
      const filepath = path.join(CONFIG.OUTPUT_DIR, filename);
      
      // Preparar datos del chunk
      const chunkData = {
        id: chunk.id,
        name: chunk.name,
        count: chunk.count,
        priority: chunk.priority || 99,
        generated: new Date().toISOString(),
        movies: chunk.movies
      };
      
      // Minificar si está configurado
      const json = CONFIG.OPTIMIZATION.minifyJson 
        ? JSON.stringify(chunkData)
        : JSON.stringify(chunkData, null, 2);
      
      // Guardar archivo
      fs.writeFileSync(filepath, json);
      
      const size = Buffer.byteLength(json, 'utf8');
      
      // Generar checksum
      const checksum = CONFIG.OPTIMIZATION.generateChecksums
        ? crypto.createHash('md5').update(json).digest('hex')
        : null;
      
      // Agregar al manifest
      this.manifest.chunks.push({
        id: chunk.id,
        name: chunk.name,
        file: `chunks/${filename}`,
        size: size,
        sizeKB: parseFloat((size / 1024).toFixed(1)),
        movies: chunk.count,
        priority: chunk.priority || 99,
        type: chunk.type || 'period',
        checksum: checksum
      });
      
      this.manifest.totalSize += size;
      
      console.log(`  ✓ ${filename} (${(size/1024).toFixed(1)}KB) - ${chunk.count} películas`);
    }
    
    // Ordenar chunks en manifest por prioridad
    this.manifest.chunks.sort((a, b) => a.priority - b.priority);
    
    // Guardar manifest
    const manifestJson = JSON.stringify(this.manifest, null, 2);
    fs.writeFileSync(CONFIG.MANIFEST_FILE, manifestJson);
    
    console.log(`\n📋 Manifest guardado: ${CONFIG.MANIFEST_FILE}`);
  }
  
  printStats() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 ESTADÍSTICAS FINALES:');
    console.log('='.repeat(50));
    console.log(`✅ Películas totales: ${this.manifest.totalMovies}`);
    console.log(`✅ Chunks generados: ${this.manifest.chunks.length}`);
    console.log(`✅ Tamaño total: ${(this.manifest.totalSize / 1024).toFixed(1)} KB`);
    console.log(`✅ Tamaño promedio por chunk: ${(this.manifest.totalSize / this.manifest.chunks.length / 1024).toFixed(1)} KB`);
    console.log('='.repeat(50));
    
    // Tabla de chunks
    console.log('\n📦 CHUNKS GENERADOS:');
    console.table(
      this.manifest.chunks.map(c => ({
        ID: c.id,
        Nombre: c.name,
        Películas: c.movies,
        'Tamaño (KB)': c.sizeKB,
        Prioridad: c.priority,
        Tipo: c.type
      }))
    );
  }
}

// ============================================
// EJECUTAR GENERADOR
// ============================================
async function main() {
  const generator = new ChunkGenerator();
  await generator.generate();
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ChunkGenerator;

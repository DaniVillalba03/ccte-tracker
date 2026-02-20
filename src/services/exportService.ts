import { openDB } from 'idb';
import { TelemetryData } from '../types/Telemetry';

const DB_NAME = 'RocketMissionDB';
const DB_VERSION = 2; // SINCRONIZADO con indexedDBService
const STORE_NAME = 'telemetry';
const CHUNK_SIZE = 5000; // Leer 5,000 registros por lote

/**
 * Exporta todos los datos de telemetría a CSV usando chunked reading
 * para evitar consumir toda la RAM.
 * 
 * CRÍTICO: NO usa toArray() para evitar explosión de memoria.
 * Lee de 5,000 en 5,000 registros usando cursores.
 * 
 * @returns Promise que se resuelve cuando la descarga inicia
 */
export async function exportTelemetryToCSV(): Promise<void> {
  try {
    console.log('🚀 Iniciando exportación chunked...');
    
    // Abrir DB con upgrade handler
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Si existe el store viejo con timestamp, borrarlo
        if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        
        // Crear nuevo store con packet_id como key (único)
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'packet_id' });
        }
      },
    });
    
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    // Obtener el total de registros
    const totalRecords = await store.count();
    console.log(`📊 Total de registros: ${totalRecords}`);
    
    if (totalRecords === 0) {
      throw new Error('No hay datos para exportar');
    }
    
    // Obtener el primer registro para sacar los headers
    const allKeys = await store.getAllKeys();
    if (allKeys.length === 0) {
      throw new Error('No hay datos para exportar');
    }
    
    const firstRecord = await store.get(allKeys[0]!);
    
    if (!firstRecord) {
      alert('Error: no se pudo leer el primer registro');
      return;
    }
    
    // Generar headers CSV
    const headers = Object.keys(firstRecord as TelemetryData).join(',');
    
    // Crear un array de strings (chunks de CSV)
    const csvChunks: string[] = [headers];
    
    // Procesar en chunks de 5,000
    let cursor = await store.openCursor();
    let chunkBuffer: string[] = [];
    let recordsProcessed = 0;
    
    while (cursor) {
      const record = cursor.value as TelemetryData;
      
      // Convertir registro a CSV row
      const row = Object.values(record)
        .map(val => typeof val === 'number' ? val.toFixed(6) : val)
        .join(',');
      
      chunkBuffer.push(row);
      recordsProcessed++;
      
      // Cuando alcanzamos el tamaño del chunk, agregarlo al CSV y limpiar buffer
      if (chunkBuffer.length >= CHUNK_SIZE) {
        csvChunks.push(...chunkBuffer);
        chunkBuffer = [];
        
        console.log(`✅ Procesados: ${recordsProcessed}/${totalRecords} (${((recordsProcessed/totalRecords)*100).toFixed(1)}%)`);
      }
      
      cursor = await cursor.continue();
    }
    
    // Agregar el último chunk (si quedaron registros)
    if (chunkBuffer.length > 0) {
      csvChunks.push(...chunkBuffer);
      console.log(`✅ Procesados: ${recordsProcessed}/${totalRecords} (100%)`);
    }
    
    // Generar el CSV completo
    const csvContent = csvChunks.join('\n');
    
    // Crear Blob y descargar
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mission_data_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    console.log(`✅ Exportación completa: ${recordsProcessed} registros`);
    
  } catch (error) {
    console.error('❌ Error al exportar:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas de la base de datos sin cargar todos los datos
 */
export async function getDatabaseStats(): Promise<{
  totalRecords: number;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  estimatedSizeMB: number;
}> {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Si existe el store viejo con timestamp, borrarlo
        if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        
        // Crear nuevo store con packet_id como key (único)
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'packet_id' });
        }
      },
    });
    
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const totalRecords = await store.count();
    
    if (totalRecords === 0) {
      return {
        totalRecords: 0,
        firstTimestamp: null,
        lastTimestamp: null,
        estimatedSizeMB: 0
      };
    }
    
    const keys = await store.getAllKeys();
    const firstTimestamp = keys[0] as number;
    const lastTimestamp = keys[keys.length - 1] as number;
    
    // Estimar tamaño (cada registro ~ 500 bytes promedio)
    const estimatedSizeMB = (totalRecords * 500) / (1024 * 1024);
    
    return {
      totalRecords,
      firstTimestamp,
      lastTimestamp,
      estimatedSizeMB
    };
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return {
      totalRecords: 0,
      firstTimestamp: null,
      lastTimestamp: null,
      estimatedSizeMB: 0
    };
  }
}

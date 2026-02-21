import { saveBatch, clearAllData } from '../services/indexedDBService';
import { TelemetryData } from '../types/Telemetry';

// Contador de paquetes para debugging
let totalPacketsSaved = 0;

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SAVE_BATCH': {
      // payload es ahora un array de TelemetryData
      const batch = payload as TelemetryData[];
      
      try {
        await saveBatch(batch);
        totalPacketsSaved += batch.length;
        
        self.postMessage({ 
          type: 'BATCH_SAVED', 
          count: batch.length,
          totalSaved: totalPacketsSaved
        });
      } catch (error) {
        console.error('[ERROR] Error guardando batch:', error);
        self.postMessage({ 
          type: 'ERROR', 
          error: error instanceof Error ? error.message : 'Unknown error saving batch'
        });
      }
      break;
    }

    case 'SAVE_CHUNK': {
      // Mantener compatibilidad con código viejo (por si acaso)
      console.warn('[WARN] SAVE_CHUNK está obsoleto, usar SAVE_BATCH');
      const singleItem = payload as TelemetryData;
      
      try {
        await saveBatch([singleItem]);
        totalPacketsSaved += 1;
        
        self.postMessage({ 
          type: 'BATCH_SAVED', 
          count: 1,
          totalSaved: totalPacketsSaved
        });
      } catch (error) {
        console.error('[ERROR] Error guardando chunk:', error);
        self.postMessage({ 
          type: 'ERROR', 
          error: error instanceof Error ? error.message : 'Unknown error saving chunk'
        });
      }
      break;
    }

    case 'FLUSH': {
      // Ya no hay buffer en el Worker, solo confirmar
      self.postMessage({ 
        type: 'FLUSH_COMPLETE', 
        count: 0,
        totalSaved: totalPacketsSaved
      });
      break;
    }

    case 'RESET_STATS': {
      // Resetear contador para nueva misión
      totalPacketsSaved = 0;
      self.postMessage({ type: 'STATS_RESET' });
      break;
    }

    case 'CLEAR_DB': {
      // Limpiar toda la base de datos (nueva misión)
      try {
        await clearAllData();
        totalPacketsSaved = 0;
        console.log('[DB] Base de datos limpiada completamente');
        self.postMessage({ type: 'DB_CLEARED' });
      } catch (error) {
        console.error('[ERROR] Error limpiando DB:', error);
        self.postMessage({ 
          type: 'ERROR', 
          error: error instanceof Error ? error.message : 'Unknown error clearing DB'
        });
      }
      break;
    }

    default:
      self.postMessage({ 
        type: 'ERROR', 
        error: `Unknown message type: ${type}` 
      });
  }
};
import { saveBatch } from '../services/indexedDBService';
import { TelemetryData } from '../types/Telemetry';

// CRÍTICO: Batch size optimizado para 400Hz
// 100 registros = ~250ms de datos a 400Hz
const BATCH_SIZE = 100;
let buffer: TelemetryData[] = [];

// Contador de paquetes para debugging
let totalPacketsSaved = 0;

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SAVE_CHUNK': {
      // Agregar al buffer
      buffer.push(payload);

      // Flush cuando alcanzamos el tamaño del batch
      if (buffer.length >= BATCH_SIZE) {
        try {
          await saveBatch([...buffer]);
          totalPacketsSaved += buffer.length;
          
          // Enviar confirmación con estadísticas
          self.postMessage({ 
            type: 'BATCH_SAVED', 
            count: buffer.length,
            totalSaved: totalPacketsSaved
          });
          
          buffer = []; // Limpiar buffer
        } catch (error) {
          console.error('❌ Error guardando batch:', error);
          self.postMessage({ 
            type: 'ERROR', 
            error: error instanceof Error ? error.message : 'Unknown error saving batch'
          });
          // CRÍTICO: No limpiar buffer si falla, reintentar en próximo flush
        }
      }
      break;
    }

    case 'FLUSH': {
      // Guardar datos restantes en el buffer
      if (buffer.length > 0) {
        try {
          await saveBatch([...buffer]);
          const count = buffer.length;
          totalPacketsSaved += count;
          
          self.postMessage({ 
            type: 'FLUSH_COMPLETE', 
            count,
            totalSaved: totalPacketsSaved
          });
          
          buffer = [];
        } catch (error) {
          self.postMessage({ 
            type: 'ERROR', 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      } else {
        self.postMessage({ 
          type: 'FLUSH_COMPLETE', 
          count: 0,
          totalSaved: totalPacketsSaved
        });
      }
      break;
    }

    case 'RESET_STATS': {
      // Resetear contador para nueva misión
      totalPacketsSaved = 0;
      buffer = [];
      self.postMessage({ type: 'STATS_RESET' });
      break;
    }

    default:
      self.postMessage({ 
        type: 'ERROR', 
        error: `Unknown message type: ${type}` 
      });
  }
};
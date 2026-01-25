import { saveBatch } from '../services/indexedDBService';
import { TelemetryData } from '../types/Telemetry';

const BATCH_SIZE = 100;
let buffer: TelemetryData[] = [];

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SAVE_CHUNK': {
      buffer.push(payload);

      if (buffer.length >= BATCH_SIZE) {
        try {
          await saveBatch([...buffer]);
          buffer = [];
          self.postMessage({ type: 'BATCH_SAVED', count: BATCH_SIZE });
        } catch (error) {
          self.postMessage({ 
            type: 'ERROR', 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
      break;
    }

    case 'FLUSH': {
      if (buffer.length > 0) {
        try {
          await saveBatch([...buffer]);
          const count = buffer.length;
          buffer = [];
          self.postMessage({ type: 'FLUSH_COMPLETE', count });
        } catch (error) {
          self.postMessage({ 
            type: 'ERROR', 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      } else {
        self.postMessage({ type: 'FLUSH_COMPLETE', count: 0 });
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
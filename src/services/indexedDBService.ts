import { openDB, IDBPDatabase } from 'idb';
import { TelemetryData } from '../types/Telemetry';

const DB_NAME = 'RocketMissionDB';
const DB_VERSION = 2; // INCREMENTADO: Cambio de schema (keyPath timestamp -> packet_id)
const STORE_NAME = 'telemetry';

let dbInstance: IDBPDatabase | null = null;

/**
 * Inicializa la base de datos IndexedDB
 * 
 * CRÍTICO: Usa packet_id como keyPath (único e incremental)
 * timestamp NO funciona con 400Hz (múltiples paquetes por millisegundo)
 */
export async function initDB(): Promise<IDBPDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
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

  return dbInstance;
}

/**
 * Guarda un lote de datos de telemetría en una sola transacción
 * Usa put() en lugar de add() para sobrescribir datos existentes y evitar errores de clave duplicada
 */
export async function saveBatch(data: TelemetryData[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  // Usar put() en lugar de add() para permitir sobrescritura
  await Promise.all(data.map(record => store.put(record)));
  await tx.done;
}

/**
 * Recupera todos los datos de la misión
 */
export async function getAllMissionData(): Promise<TelemetryData[]> {
  const db = await initDB();
  return await db.getAll(STORE_NAME);
}

/**
 * Limpia todos los datos de telemetría
 */
export async function clearAllData(): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.objectStore(STORE_NAME).clear();
  await tx.done;
}
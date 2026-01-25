import { openDB, IDBPDatabase } from 'idb';
import { TelemetryData } from '@types/Telemetry';

const DB_NAME = 'RocketMissionDB';
const DB_VERSION = 1;
const STORE_NAME = 'telemetry';

let dbInstance: IDBPDatabase | null = null;

/**
 * Inicializa la base de datos IndexedDB
 */
export async function initDB(): Promise<IDBPDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
      }
    },
  });

  return dbInstance;
}

/**
 * Guarda un lote de datos de telemetría en una sola transacción
 */
export async function saveBatch(data: TelemetryData[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  await Promise.all(data.map(record => store.add(record)));
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
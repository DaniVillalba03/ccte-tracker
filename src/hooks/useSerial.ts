import { useRef, useState, useCallback, useEffect } from 'react';
import { TelemetryData } from '../types/Telemetry';
import { parseTelemetryString, validateTelemetryData } from '../utils/dataParsing';
import '../types/web-serial.d.ts';

interface UseSerialReturn {
  /** Estado de conexión con el puerto serial */
  isConnected: boolean;
  /** Función para iniciar conexión con baudRate configurable */
  connect: (baudRate?: number) => Promise<void>;
  /** Función para desconectar */
  disconnect: () => Promise<void>;
  /** Último dato de telemetría recibido (para UI) */
  latestDataRef: React.MutableRefObject<TelemetryData | null>;
  /** Mensaje de error si existe */
  error: string | null;
  /** Estadísticas de conexión */
  stats: {
    packetsReceived: number;
    packetsInvalid: number;
    lastUpdateTime: number;
  };
  /** BaudRate actual de la conexión */
  currentBaudRate: number | null;
  /** Estado de heartbeat de enlace High-Speed */
  isHighSpeedActive: boolean;
  /** Estado de heartbeat de enlace LoRa */
  isLoraActive: boolean;
}

const DEFAULT_BAUD_RATE = 115200;
const HEARTBEAT_TIMEOUT_MS = 2000; // 2 segundos sin datos = enlace muerto

// ========== CONFIGURACIÓN DE THROTTLING ==========
const UI_UPDATE_INTERVAL_MS = 33; // 30Hz (cada 33ms)
const DB_BATCH_SIZE = 500; // Tamaño del lote para IndexedDB
const DB_BATCH_TIMEOUT_MS = 1000; // Flush forzado cada 1 segundo
const MAX_BUFFER_LENGTH = 10000; // Límite de seguridad para buffer de texto

// ========== HANDSHAKE ==========
const HANDSHAKE_BYTE = 'S'; // Byte que despierta al ESP32

export function useSerial(): UseSerialReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBaudRate, setCurrentBaudRate] = useState<number | null>(null);
  
  // NUEVO: Estados de heartbeat independientes
  const [isHighSpeedActive, setIsHighSpeedActive] = useState(false);
  const [isLoraActive, setIsLoraActive] = useState(false);
  
  const [stats, setStats] = useState({
    packetsReceived: 0,
    packetsInvalid: 0,
    lastUpdateTime: 0,
  });

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<any>(null);
  const latestDataRef = useRef<TelemetryData | null>(null);
  const dbWorkerRef = useRef<Worker | null>(null);
  const keepReadingRef = useRef(false);
  const lastFullDataRef = useRef<TelemetryData | null>(null);
  
  // NUEVO: Timestamps de último paquete recibido por enlace
  const lastHighSpeedTimeRef = useRef<number>(0);
  const lastLoraTimeRef = useRef<number>(0);

  // ========== ESTADÍSTICAS INTERNAS (NO DISPARAN RE-RENDER) ==========
  const internalStatsRef = useRef({
    packetsReceived: 0,
    packetsInvalid: 0,
    lastUpdateTime: 0,
  });

  // ========== BUFFER DE BASE DE DATOS (BATCHING) ==========
  const dbBufferRef = useRef<TelemetryData[]>([]);
  const lastDbFlushTimeRef = useRef<number>(Date.now());

  // Inicializar Worker al montar el componente
  useEffect(() => {
    dbWorkerRef.current = new Worker(
      new URL('../workers/dbWorker.ts', import.meta.url),
      { type: 'module' }
    );

    // Escuchar mensajes del Worker
    dbWorkerRef.current.onmessage = (event) => {
      const { type, error: workerError } = event.data;
      
      if (type === 'ERROR') {
        console.error('DB Worker Error:', workerError);
      }
    };

    return () => {
      dbWorkerRef.current?.terminate();
    };
  }, []);

  // NUEVO: Watchdog de heartbeat (verifica estado cada 500ms)
  useEffect(() => {
    const watchdog = setInterval(() => {
      const now = Date.now();
      const highSpeedTimeSinceLastPacket = now - lastHighSpeedTimeRef.current;
      const loraTimeSinceLastPacket = now - lastLoraTimeRef.current;

      // Actualizar estado de High-Speed
      setIsHighSpeedActive(highSpeedTimeSinceLastPacket < HEARTBEAT_TIMEOUT_MS);
      
      // Actualizar estado de LoRa
      setIsLoraActive(loraTimeSinceLastPacket < HEARTBEAT_TIMEOUT_MS);
    }, 500); // Check cada 500ms

    return () => clearInterval(watchdog);
  }, []);

  // ========== UI UPDATE LOOP (30Hz) ==========
  useEffect(() => {
    if (!isConnected) return;

    const uiUpdateInterval = setInterval(() => {
      // Actualizar stats de UI desde referencia interna
      setStats({
        packetsReceived: internalStatsRef.current.packetsReceived,
        packetsInvalid: internalStatsRef.current.packetsInvalid,
        lastUpdateTime: internalStatsRef.current.lastUpdateTime,
      });
    }, UI_UPDATE_INTERVAL_MS);

    return () => clearInterval(uiUpdateInterval);
  }, [isConnected]);

  // ========== DB FLUSH LOOP (verificar cada 250ms) ==========
  useEffect(() => {
    if (!isConnected) return;

    const dbFlushInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastFlush = now - lastDbFlushTimeRef.current;
      
      // Flush si alcanzamos timeout O si el buffer está lleno
      if (
        dbBufferRef.current.length >= DB_BATCH_SIZE ||
        (dbBufferRef.current.length > 0 && timeSinceLastFlush >= DB_BATCH_TIMEOUT_MS)
      ) {
        flushDatabaseBuffer();
      }
    }, 250);

    return () => clearInterval(dbFlushInterval);
  }, [isConnected]);

  /**
   * Envía el buffer acumulado a IndexedDB en un solo batch
   */
  const flushDatabaseBuffer = useCallback(() => {
    if (dbBufferRef.current.length === 0) return;

    const batch = [...dbBufferRef.current];
    dbBufferRef.current = []; // Limpiar buffer inmediatamente
    lastDbFlushTimeRef.current = Date.now();

    // Enviar batch completo al Worker
    dbWorkerRef.current?.postMessage({
      type: 'SAVE_BATCH',
      payload: batch,
    });

    console.log(`[BATCH] Enviado: ${batch.length} paquetes`);
  }, []);

  /**
   * Agrega un paquete al buffer de base de datos (SIN escribir aún)
   */
  const addToDbBuffer = useCallback((data: TelemetryData) => {
    dbBufferRef.current.push(data);
    
    // Flush inmediato si alcanzamos el tamaño máximo
    if (dbBufferRef.current.length >= DB_BATCH_SIZE) {
      flushDatabaseBuffer();
    }
  }, [flushDatabaseBuffer]);

  /**
   * Resetea completamente el estado de telemetría
   */
  const resetTelemetryState = useCallback(() => {
    console.log('[RESET] Reseteando estado de telemetría...');
    
    latestDataRef.current = null;
    lastFullDataRef.current = null;
    lastHighSpeedTimeRef.current = 0;
    lastLoraTimeRef.current = 0;
    
    internalStatsRef.current = {
      packetsReceived: 0,
      packetsInvalid: 0,
      lastUpdateTime: 0,
    };
    
    setStats({
      packetsReceived: 0,
      packetsInvalid: 0,
      lastUpdateTime: 0,
    });
    
    dbBufferRef.current = [];
    lastDbFlushTimeRef.current = Date.now();
    setIsHighSpeedActive(false);
    setIsLoraActive(false);
    
    // Resetear contador del Worker Y limpiar la base de datos
    dbWorkerRef.current?.postMessage({ type: 'RESET_STATS' });
    dbWorkerRef.current?.postMessage({ type: 'CLEAR_DB' });
    
    console.log('[RESET] Estado de telemetría reseteado completamente + DB limpiada');
  }, []);

  /**
   * Conecta al puerto serial con baudRate configurable y handshake
   * @param baudRate - Velocidad de transmisión (por defecto 115200)
   */
  const connect = useCallback(async (baudRate: number = DEFAULT_BAUD_RATE) => {
    try {
      setError(null);

      // Verificar soporte de Web Serial API
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API no soportada en este navegador');
      }

      // ========== PASO 1: SOLICITAR Y ABRIR PUERTO ==========
      const port = await navigator.serial.requestPort();
      portRef.current = port;

      console.log(`[SERIAL] Abriendo puerto @ ${baudRate} baud`);
      await port.open({ baudRate });
      console.log(`[SERIAL] Puerto serial abierto @ ${baudRate} baud`);

      // Esperar a que el ESP32 se resetee y entre en el bucle de espera (DTR reset)
      console.log('[ESP32] Esperando reset del ESP32 (1 segundo)...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // ========== PASO 2: RESETEAR ESTADO COMPLETAMENTE ==========
      resetTelemetryState();

      // ========== PASO 3: ENVIAR HANDSHAKE INMEDIATAMENTE ==========
      // El ESP32 está bloqueado en while(Serial.available() <= 0) esperando este byte
      console.log('[HANDSHAKE] Enviando handshake al ESP32...');
      const writer = port.writable?.getWriter();
      if (!writer) {
        throw new Error('No se pudo obtener el writer');
      }
      
      const handshakeByte = new Uint8Array([HANDSHAKE_BYTE.charCodeAt(0)]); // 'S' = 0x53
      await writer.write(handshakeByte);
      await writer.releaseLock();
      
      console.log('[HANDSHAKE] Handshake enviado: "S"');
      
      // Esperar 200ms para que el ESP32 procese el handshake y limpie su buffer
      await new Promise(resolve => setTimeout(resolve, 200));

      // ========== PASO 4: CONFIGURAR ESTADO DE CONEXIÓN ==========
      setIsConnected(true);
      setCurrentBaudRate(baudRate);
      keepReadingRef.current = true;

      // ========== PASO 5: CONFIGURAR PIPELINE DE LECTURA ==========
      // Leer bytes RAW y decodificar manualmente (más confiable que TextDecoderStream)
      const rawReader = port.readable?.getReader();
      
      if (!rawReader) {
        throw new Error('No se pudo obtener el reader del stream');
      }
      
      readerRef.current = rawReader as any;
      
      console.log('[READY] Reader RAW configurado, listo para recibir telemetría desde Paquete #1');

      // ========== PASO 6: INICIAR LOOP DE LECTURA ==========
      let textBuffer = '';
      let lineCount = 0;
      let lastLogTime = Date.now();
      let firstPacketReceived = false;
      const decoder = new TextDecoder('utf-8');

      const readLoop = async () => {
        try {
          while (keepReadingRef.current && rawReader) {
            const { value, done } = await rawReader.read();
            
            if (done) {
              console.log('[SERIAL] Serial stream cerrado');
              break;
            }

            if (value && value.length > 0) {
              // Decodificar bytes a texto
              const chunk = decoder.decode(value, { stream: true });
              
              // LOG TEMPORAL: Verificar primeros bytes
              if (!firstPacketReceived && textBuffer.length < 100) {
                const bytes = Array.from(value.slice(0, 20));
                const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
                const ascii = bytes.map(b => {
                  if (b === 10) return '\\n';
                  if (b === 13) return '\\r';
                  if (b >= 32 && b <= 126) return String.fromCharCode(b);
                  return '.';
                }).join('');
                console.log(`[DEBUG] Bytes recibidos (hex): ${hex}`);
                console.log(`[DEBUG] Bytes recibidos (ascii): "${ascii}"`);
                console.log(`[DEBUG] Decodificado como: "${chunk.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`);  
              }
              
              // Agregar chunk al buffer
              textBuffer += chunk;

              // SEGURIDAD: Limitar tamaño del buffer para prevenir memory leak
              if (textBuffer.length > MAX_BUFFER_LENGTH) {
                console.warn('[WARN] Buffer de texto excedió límite, descartando datos antiguos');
                // Buscar último delimitador (\n o \r) y descartar todo lo anterior
                const lastNewlineIndex = Math.max(
                  textBuffer.lastIndexOf('\n'),
                  textBuffer.lastIndexOf('\r')
                );
                if (lastNewlineIndex !== -1) {
                  textBuffer = textBuffer.substring(lastNewlineIndex + 1);
                } else {
                  textBuffer = ''; // Descartar todo si no hay newline
                }
              }

              // Procesar líneas completas (soporta \n, \r, o \r\n)
              const getNextLineIndex = (text: string) => {
                const nIndex = text.indexOf('\n');
                const rIndex = text.indexOf('\r');
                
                if (nIndex === -1 && rIndex === -1) return -1;
                if (nIndex === -1) return rIndex;
                if (rIndex === -1) return nIndex;
                return Math.min(nIndex, rIndex);
              };
              
              let newlineIndex = getNextLineIndex(textBuffer);
              
              while (newlineIndex !== -1) {
                const line = textBuffer.substring(0, newlineIndex).trim();
                // Saltar \r\n si están juntos
                const nextChar = textBuffer[newlineIndex + 1];
                const skipChars = (textBuffer[newlineIndex] === '\r' && nextChar === '\n') ? 2 : 1;
                textBuffer = textBuffer.substring(newlineIndex + skipChars);

                // Procesar línea (incluso si está vacía, para actualizar contador)
                if (line) { // Solo procesar si la línea tiene contenido
                  lineCount++;

                  // Log del primer paquete recibido
                  if (!firstPacketReceived) {
                    console.log(`[DATA] PRIMER PAQUETE RECIBIDO: "${line.substring(0, 50)}..."`);
                    firstPacketReceived = true;
                  }

                  // Log de velocidad cada 5 segundos
                  const now = Date.now();
                  if (now - lastLogTime >= 5000) {
                    const elapsedSeconds = (now - lastLogTime) / 1000;
                    const packetsPerSecond = lineCount / elapsedSeconds;
                    console.log(`[STATS] Velocidad: ${packetsPerSecond.toFixed(1)} pkt/s (${lineCount} paquetes en ${elapsedSeconds.toFixed(1)}s)`);
                    console.log(`[STATS] Stats: ${internalStatsRef.current.packetsReceived} válidos, ${internalStatsRef.current.packetsInvalid} inválidos`);
                    lineCount = 0;
                    lastLogTime = now;
                  }

                  // ========== PARSING Y VALIDACIÓN (400Hz) ==========
                  const parsed = parseTelemetryString(line);

                  if (parsed && validateTelemetryData(parsed.data)) {
                    const { data: telemetryData, packetType } = parsed;

                    // ========== ACTUALIZAR HEARTBEAT según tipo de paquete ==========
                    const nowTime = Date.now();
                    if (packetType === 'F') {
                      lastHighSpeedTimeRef.current = nowTime;
                    } else if (packetType === 'S') {
                      lastLoraTimeRef.current = nowTime;
                    }

                    // ========== ACTUALIZAR ESTADÍSTICAS INTERNAS (NO RE-RENDER) ==========
                    internalStatsRef.current.packetsReceived++;
                    internalStatsRef.current.lastUpdateTime = nowTime;

                    // ========== LÓGICA DE PERSISTENCIA (HOLD LAST VALUE) ==========
                    let finalData: TelemetryData;

                    if (packetType === 'F') {
                      // Paquete FULL: Actualizar todo
                      finalData = telemetryData;
                      lastFullDataRef.current = telemetryData;
                    } else if (packetType === 'S') {
                      // Paquete SURVIVAL: Actualizar solo GPS y altitud
                      if (lastFullDataRef.current) {
                        finalData = {
                          ...lastFullDataRef.current,
                          gps_lat: telemetryData.gps_lat,
                          gps_lng: telemetryData.gps_lng,
                          gps_alt: telemetryData.gps_alt,
                          altitude: telemetryData.altitude,
                          mission_time: telemetryData.mission_time,
                          timestamp: telemetryData.timestamp,
                          packet_id: telemetryData.packet_id,
                        };
                      } else {
                        finalData = telemetryData;
                      }
                    } else {
                      finalData = telemetryData;
                    }

                    // ========== ACTUALIZAR REFERENCIA PARA UI (NO RE-RENDER) ==========
                    latestDataRef.current = finalData;

                    // ========== AGREGAR AL BUFFER DE DB (BATCHING) ==========
                    addToDbBuffer(telemetryData);

                  } else {
                    // ========== PAQUETE INVÁLIDO ==========
                    internalStatsRef.current.packetsInvalid++;
                    
                    // Log solo cada 100 paquetes inválidos para no saturar consola
                    if (internalStatsRef.current.packetsInvalid % 100 === 0) {
                      console.warn(`[WARN] ${internalStatsRef.current.packetsInvalid} paquetes inválidos (último: "${line.substring(0, 50)}...")`);  
                    }
                  }
                } // Fin de if (line)
                
                // Recalcular índice para siguiente iteración
                newlineIndex = getNextLineIndex(textBuffer);
              }
            }
          }
        } catch (readError) {
          if (keepReadingRef.current) {
            console.error('[ERROR] Error en lectura serial:', readError);
            setError(readError instanceof Error ? readError.message : 'Error de lectura');
          }
        } finally {
          // Flush final del buffer de DB al terminar lectura
          if (dbBufferRef.current.length > 0) {
            console.log(`[FLUSH] Flush final: ${dbBufferRef.current.length} paquetes`);
            flushDatabaseBuffer();
          }

          if (rawReader) {
            rawReader.releaseLock();
          }
        }
      };

      // Iniciar loop de lectura
      readLoop();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMessage);
      setIsConnected(false);
      setCurrentBaudRate(null);
      console.error('[ERROR] Error al conectar puerto serial:', err);
    }
  }, [addToDbBuffer, flushDatabaseBuffer, resetTelemetryState]);

  /**
   * Desconecta el puerto serial
   */
  const disconnect = useCallback(async () => {
    try {
      keepReadingRef.current = false;

      // Flush final antes de desconectar
      if (dbBufferRef.current.length > 0) {
        console.log(`[FLUSH] Flush final antes de desconectar: ${dbBufferRef.current.length} paquetes`);
        flushDatabaseBuffer();
      }

      // Cancelar lectura
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }

      // Cerrar puerto
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }

      setIsConnected(false);
      setCurrentBaudRate(null);
      setError(null);
      
      // Resetear estados de heartbeat
      setIsHighSpeedActive(false);
      setIsLoraActive(false);
      lastHighSpeedTimeRef.current = 0;
      lastLoraTimeRef.current = 0;
      
      console.log('🔌 Puerto serial desconectado');
    } catch (err) {
      console.error('[ERROR] Error al desconectar:', err);
      setError(err instanceof Error ? err.message : 'Error al desconectar');
    }
  }, [flushDatabaseBuffer]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [isConnected, disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
    latestDataRef,
    error,
    stats,
    currentBaudRate,
    isHighSpeedActive, // NUEVO
    isLoraActive,      // NUEVO
  };
}

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
}

const DEFAULT_BAUD_RATE = 115200;

export function useSerial(): UseSerialReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBaudRate, setCurrentBaudRate] = useState<number | null>(null);
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

  /**
   * Conecta al puerto serial con baudRate configurable
   * @param baudRate - Velocidad de transmisión (por defecto 115200)
   */
  const connect = useCallback(async (baudRate: number = DEFAULT_BAUD_RATE) => {
    try {
      setError(null);

      // Verificar soporte de Web Serial API
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API no soportada en este navegador');
      }

      // Solicitar puerto al usuario
      const port = await navigator.serial.requestPort();
      portRef.current = port;

      // Abrir puerto con baudRate configurable
      await port.open({ baudRate });
      
      setIsConnected(true);
      setCurrentBaudRate(baudRate);
      keepReadingRef.current = true;

      console.log(`Puerto serial abierto con baudRate: ${baudRate}`);

      // Configurar pipeline de lectura con TextDecoderStream
      const textDecoder = new TextDecoderStream();
      const transformedStream = port.readable?.pipeThrough(textDecoder as any);
      const reader = transformedStream?.getReader();
      
      if (!reader) {
        throw new Error('No se pudo obtener el reader del stream');
      }
      
      readerRef.current = reader;

      // Buffer para acumular líneas incompletas
      let buffer = '';

      // Loop de lectura
      const readLoop = async () => {
        try {
          while (keepReadingRef.current && reader) {
            const { value, done } = await reader.read();
            
            if (done) {
              console.log('Serial stream cerrado');
              break;
            }

            if (value) {
              // Acumular en buffer
              buffer += value;

              // Procesar líneas completas (separadas por \n)
              const lines = buffer.split('\n');
              
              // Guardar la última línea incompleta en el buffer
              buffer = lines.pop() || '';

              // Procesar cada línea completa
              for (const line of lines) {
                if (line.trim()) {
                  const telemetryData = parseTelemetryString(line);

                  if (telemetryData && validateTelemetryData(telemetryData)) {
                    // Actualizar estadísticas
                    setStats(prev => ({
                      packetsReceived: prev.packetsReceived + 1,
                      packetsInvalid: prev.packetsInvalid,
                      lastUpdateTime: Date.now(),
                    }));

                    // Actualizar referencia para UI (sin re-render)
                    latestDataRef.current = telemetryData;

                    // Enviar al Worker para persistencia
                    dbWorkerRef.current?.postMessage({
                      type: 'SAVE_CHUNK',
                      payload: telemetryData,
                    });
                  } else {
                    // Datos inválidos
                    setStats(prev => ({
                      ...prev,
                      packetsInvalid: prev.packetsInvalid + 1,
                    }));
                    console.warn('Paquete de telemetría inválido:', line);
                  }
                }
              }
            }
          }
        } catch (readError) {
          if (keepReadingRef.current) {
            console.error('Error en lectura serial:', readError);
            setError(readError instanceof Error ? readError.message : 'Error de lectura');
          }
        } finally {
          if (reader) {
            reader.releaseLock();
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
      console.error('Error al conectar puerto serial:', err);
    }
  }, []);

  /**
   * Desconecta el puerto serial
   */
  const disconnect = useCallback(async () => {
    try {
      keepReadingRef.current = false;

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

      // Flush del Worker
      dbWorkerRef.current?.postMessage({ type: 'FLUSH' });

      setIsConnected(false);
      setCurrentBaudRate(null);
      setError(null);
      
      console.log('Puerto serial desconectado');
    } catch (err) {
      console.error('Error al desconectar:', err);
      setError(err instanceof Error ? err.message : 'Error al desconectar');
    }
  }, []);

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
  };
}

import { useState, useEffect, useCallback } from 'react';
import { TelemetryData } from '../types/Telemetry';

interface Position {
  lat: number;
  lng: number;
}

const MAX_TRAJECTORY_POINTS = 1000;

export function useTrajectory(latestData: TelemetryData | null) {
  // CAMBIO CRÍTICO: Usar useState en lugar de useRef para forzar re-renders
  const [trajectory, setTrajectory] = useState<Position[]>([]);

  useEffect(() => {
    if (latestData && (latestData.gps_lat !== 0 || latestData.gps_lng !== 0)) {
      // Agregar nuevo punto a la trayectoria
      setTrajectory(prev => {
        const newTrajectory = [...prev, {
          lat: latestData.gps_lat,
          lng: latestData.gps_lng,
        }];

        // Mantener solo los últimos N puntos
        if (newTrajectory.length > MAX_TRAJECTORY_POINTS) {
          newTrajectory.shift();
        }

        return newTrajectory;
      });
    }
  }, [latestData]);

  // Función para limpiar la trayectoria
  const clearTrajectory = useCallback(() => {
    setTrajectory([]);
  }, []);

  return {
    currentPos: latestData 
      ? { lat: latestData.gps_lat, lng: latestData.gps_lng }
      : { lat: 0, lng: 0 },
    trajectory,
    clearTrajectory,
  };
}

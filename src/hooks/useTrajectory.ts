import { useRef, useEffect } from 'react';
import { TelemetryData } from '../types/Telemetry';

interface Position {
  lat: number;
  lng: number;
}

const MAX_TRAJECTORY_POINTS = 1000;

export function useTrajectory(latestData: TelemetryData | null) {
  const trajectoryRef = useRef<Position[]>([]);

  useEffect(() => {
    if (latestData && (latestData.gps_lat !== 0 || latestData.gps_lng !== 0)) {
      // Agregar nuevo punto a la trayectoria
      trajectoryRef.current.push({
        lat: latestData.gps_lat,
        lng: latestData.gps_lng,
      });

      // Mantener solo los últimos N puntos
      if (trajectoryRef.current.length > MAX_TRAJECTORY_POINTS) {
        trajectoryRef.current.shift();
      }
    }
  }, [latestData]);

  return {
    currentPos: latestData 
      ? { lat: latestData.gps_lat, lng: latestData.gps_lng }
      : { lat: 0, lng: 0 },
    trajectory: trajectoryRef.current,
  };
}

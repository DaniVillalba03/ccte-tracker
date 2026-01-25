import { useEffect, useRef } from 'react';
import { TelemetryData } from '../../types/Telemetry';
import './Scene3D.css';

interface Scene3DProps {
  data: TelemetryData | null;
}

/**
 * Vista 3D del cohete con transformaciones CSS
 */
export function Scene3D({ data }: Scene3DProps) {
  const rocketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rocketRef.current || !data) return;

    // Umbral de despegue: altitud mayor a 5 metros O estado de vuelo activo
    const hasLaunched = data.mission_state >= 2 && data.altitude > 5;

    // Aplicar rotaciones del giroscopio (valores en °/s, multiplicamos para efecto visual)
    // Pitch (cabeceo): rotación alrededor del eje X
    // INVERTIDO: Restar 90° para compensar orientación del modelo (apunta hacia arriba)
    const pitch = hasLaunched ? (90 - data.gyro_x * 2) : 0;
    
    // Roll (alabeo): rotación alrededor del eje Z
    const roll = hasLaunched ? data.gyro_z * 2 : 0;
    
    // Yaw (guiñada): rotación alrededor del eje Y
    const yaw = hasLaunched ? data.gyro_y * 2 : 0;

    // Elevar el cohete proporcionalmente a la altitud
    const verticalOffset = hasLaunched 
      ? Math.min(data.altitude * 0.5, 150)  // Máximo 150px de elevación
      : 0;

    // Aplicar transformaciones 3D
    // ORDEN IMPORTANTE: rotateX (pitch) -> rotateY (yaw) -> rotateZ (roll) -> translateY (altura)
    rocketRef.current.style.transform = `
      rotateX(${pitch}deg)
      rotateY(${yaw}deg)
      rotateZ(${roll}deg)
      translateY(-${verticalOffset}px)
    `;

    // Desvanecer la plataforma cuando despega
    const platformElement = document.querySelector('.launch-platform') as HTMLElement;
    if (platformElement) {
      if (hasLaunched) {
        platformElement.classList.add('fade-out');
      } else {
        platformElement.classList.remove('fade-out');
      }
    }
  }, [data]);

  return (
    <div className="scene3d-container">
      {/* Panel de telemetría */}
      {data && (
        <div className="telemetry-panel">
          <div className="panel-header">
            <span className="panel-icon">⚙</span>
          </div>
          
          <div className="telemetry-grid">
            <div className="telemetry-row">
              <div className="telemetry-card compact">
                <div className="card-label">Pitch</div>
                <div className="card-value small">{data.gyro_x.toFixed(1)}°/s</div>
              </div>
              <div className="telemetry-card compact">
                <div className="card-label">Roll</div>
                <div className="card-value small">{data.gyro_z.toFixed(1)}°/s</div>
              </div>
              <div className="telemetry-card compact">
                <div className="card-label">Yaw</div>
                <div className="card-value small">{data.gyro_y.toFixed(1)}°/s</div>
              </div>
            </div>
            <div className="telemetry-row">
              <div className="telemetry-card compact highlight">
                <div className="card-label">Alt</div>
                <div className="card-value small">{data.altitude.toFixed(0)}m</div>
              </div>
              <div className="telemetry-card compact highlight">
                <div className="card-label">Vel</div>
                <div className="card-value small">{data.velocity_z.toFixed(1)}m/s</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="scene3d-viewport">
        <div className="scene3d-stage">
          {/* Plataforma de lanzamiento */}
          <div className="launch-platform">
            <div className="platform-base"></div>
            <div className="platform-tower"></div>
          </div>

          <div ref={rocketRef} className="rocket-3d">
            {/* Punta del cohete */}
            <div className="rocket-nose"></div>
            
            {/* Cuerpo del cohete */}
            <div className="rocket-body">
              <div className="rocket-window"></div>
              <div className="rocket-stripe"></div>
            </div>
            
            {/* Aletas */}
            <div className="rocket-fin rocket-fin-1"></div>
            <div className="rocket-fin rocket-fin-2"></div>
            <div className="rocket-fin rocket-fin-3"></div>
            <div className="rocket-fin rocket-fin-4"></div>
            
            {/* Motor */}
            <div className="rocket-engine">
              {data?.mission_state === 2 && (
                <div className="rocket-flame"></div>
              )}
            </div>
          </div>
        </div>
        
        {/* Grilla de referencia */}
        <div className="reference-grid"></div>
      </div>
    </div>
  );
}

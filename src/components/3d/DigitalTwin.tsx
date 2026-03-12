/**
 * DigitalTwin.tsx — Vista "Ingeniería CAD Táctica"
 *
 * REGLA CRÍTICA DE RENDIMIENTO:
 *   La rotación NUNCA pasa por useState.
 *   useFrame muta rocketRef.current.rotation directamente,
 *   saltándose por completo el reconciliador de React.
 *
 * El subcomponente RocketModel recibe las tres orientaciones en grados
 * (pitch_raw, roll_raw, yaw_raw) como props escalares derivadas de la
 * IMU cruda. useFrame las convierte a radianes y las escribe directo en
 * la propiedad rotation del Group de Three.js — cero setState.
 */
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { TelemetryData } from '../../types/Telemetry';
import './DigitalTwin.css';

// ── Constantes numéricas ───────────────────────────────────────────────
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ── Geometría esbelto (proporciones cohete real ~20:1) ─────────────────
const R_BODY    = 0.15;  // radio del fuselaje
const H_BODY    = 4.50;  // fuselaje principal largo y esbelto
const H_NOSE    = 0.70;  // cofia pequeña
const H_NOZZLE  = 0.40;  // altura de la tobera
const R_NOZZLE  = 0.09;  // radio exhaust de la tobera

// Aletas trapezoidales reales
const FIN_ROOT  = 0.62;  // cuerda en la raíz (más ancha)
const FIN_TIP   = 0.30;  // cuerda en el extremo
const FIN_SPAN  = 0.42;  // envergadura radial
const FIN_THICK = 0.025; // espesor del perfil

// ── Props del subcomponente 3D ─────────────────────────────────────────
interface RocketModelProps {
  pitch_raw: number; // grados (desde acelerómetro)
  roll_raw:  number; // grados (desde acelerómetro)
  yaw_raw:   number; // grados (desde magnetómetro)
}

// ── Subcomponente: malla táctica del cohete ────────────────────────────
function RocketModel({ pitch_raw, roll_raw, yaw_raw }: RocketModelProps) {
  const rocketRef = useRef<THREE.Group>(null!);

  // ── Geometrías base (instanciadas una sola vez) ────────────────────
  // Ojiva curva — perfil sinusoidal (tangent ogive): r = R_BODY·sin((1-t)·π/2)
  const noseGeo = useMemo(() => {
    const N = 24;
    const pts = Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      const r = R_BODY * Math.sin((1 - t) * Math.PI / 2);
      const y = t * H_NOSE - H_NOSE / 2; // centrada en Y=0
      return new THREE.Vector2(r, y);
    });
    return new THREE.LatheGeometry(pts, 16);
  }, []);
  // Fuselaje dividido en 3 segmentos iguales
  const SEG_H     = H_BODY / 3;
  const segGeo    = useMemo(() => new THREE.CylinderGeometry(R_BODY, R_BODY, SEG_H, 32, 1), []);
  const nozzleGeo = useMemo(() => new THREE.CylinderGeometry(R_BODY * 0.78, R_NOZZLE, H_NOZZLE, 12), []);
  // Trapecio: span en X (radial), chord en Y (axial), extruido en Z (espesor)
  const finGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-FIN_SPAN / 2, -FIN_ROOT / 2); // raíz trailing
    shape.lineTo(-FIN_SPAN / 2,  FIN_ROOT / 2); // raíz leading
    shape.lineTo( FIN_SPAN / 2,  FIN_TIP  / 2); // punta leading (borde barrido)
    shape.lineTo( FIN_SPAN / 2, -FIN_TIP  / 2); // punta trailing
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: FIN_THICK, bevelEnabled: false });
    geo.translate(0, 0, -FIN_THICK / 2); // centrar en Z
    return geo;
  }, []);

  // Geometría compartida para las 4 líneas verticales del fuselaje
  const vertLineGeo = useMemo(() => {
    const pts = [new THREE.Vector3(0, -H_BODY / 2, 0), new THREE.Vector3(0, H_BODY / 2, 0)];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  // 4 costillas slant sobre la superficie cónica de la tobera
  const nozzleRibGeo = useMemo(() => {
    const R_TOP = R_BODY * 0.78;
    const pts: THREE.Vector3[] = [];
    [0, 90, 180, 270].forEach(deg => {
      const a = deg * DEG2RAD;
      pts.push(new THREE.Vector3(Math.sin(a) * R_TOP,    H_NOZZLE / 2, Math.cos(a) * R_TOP));
      pts.push(new THREE.Vector3(Math.sin(a) * R_NOZZLE, -H_NOZZLE / 2, Math.cos(a) * R_NOZZLE));
    });
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  // ── Material sólido blanco para cofia y aletas ─────────────────────
  const matSolid = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.1 }),
    [],
  );

  // ── EdgesGeometry con umbral 45° — elimina aristas verticales del cilindro,
  //    conserva solo los aros circulares superiores e inferiores de cada sección ──
  const segEdges    = useMemo(() => new THREE.EdgesGeometry(segGeo, 45),    [segGeo]);
  const nozzleEdges = useMemo(() => new THREE.EdgesGeometry(nozzleGeo, 45), [nozzleGeo]);

  // Ángulos de distribución de las 4 aletas (cada 90°)
  const finAngles = useMemo(() => [0, 90, 180, 270].map(a => a * DEG2RAD), []);

  // ── CRÍTICO: mutación directa — cero re-renders de React ───────────
  useFrame(() => {
    if (!rocketRef.current) return;
    rocketRef.current.rotation.x = pitch_raw * DEG2RAD;
    rocketRef.current.rotation.z = roll_raw  * DEG2RAD;
    rocketRef.current.rotation.y = yaw_raw   * DEG2RAD;
  });

  // Posiciones Y relativas al centro del fuselaje
  const noseY   =  H_BODY / 2 + H_NOSE   / 2;
  const nozzleY = -H_BODY / 2 - H_NOZZLE / 2;
  const finY    = -H_BODY / 2 + FIN_ROOT  / 2 + 0.20; // ligeramente elevadas

  return (
    <group ref={rocketRef}>

      {/* ── Ejes de la IMU (R=X, G=Y, B=Z) — rotan solidarios, tamaño ampliado ── */}
      <axesHelper args={[2.5]} />

      {/* ── Ojiva alargada — sólido blanco ── */}
      <mesh geometry={noseGeo} material={matSolid} position={[0, noseY, 0]} />

      {/* ── Fuselaje: 3 segmentos apilados — solo aros perimetrales ── */}
      {[-1, 0, 1].map(i => (
        <lineSegments key={i} geometry={segEdges} position={[0, i * SEG_H, 0]}>
          <lineBasicMaterial color="#ffffff" />
        </lineSegments>
      ))}

      {/* ── Tobera troncocónica — aros perimetrales ── */}
      <lineSegments geometry={nozzleEdges} position={[0, nozzleY, 0]}>
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      {/* ── 4 costillas de la tobera/motor (líneas slant) ── */}
      <lineSegments geometry={nozzleRibGeo} position={[0, nozzleY, 0]}>
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      {/* ── 4 líneas verticales del fuselaje a 90° ── */}
      {[0, 90, 180, 270].map((deg, i) => {
        const a = deg * DEG2RAD;
        return (
          <lineSegments key={i} geometry={vertLineGeo} position={[Math.sin(a) * R_BODY, 0, Math.cos(a) * R_BODY]}>
            <lineBasicMaterial color="#ffffff" />
          </lineSegments>
        );
      })}

      {/* ── Cuatro aletas trapezoidales — sólido blanco ── */}
      {finAngles.map((angle, i) => {
        const radialOffset = R_BODY + FIN_SPAN / 2;
        const px = Math.sin(angle) * radialOffset;
        const pz = Math.cos(angle) * radialOffset;
        return (
          <mesh
            key={i}
            geometry={finGeo}
            material={matSolid}
            position={[px, finY, pz]}
            rotation={[0, angle - Math.PI / 2, 0]}
          />
        );
      })}

    </group>
  );
}

// ── Overlay de actitud RAW (HTML puro — sin Three.js) ─────────────────
interface OverlayProps {
  pitch: number;
  roll:  number;
  yaw:   number;
}
function AttitudeOverlay({ pitch, roll, yaw }: OverlayProps) {
  return (
    <div className="dt-overlay">
      <span className="dt-label">PITCH <strong>{pitch.toFixed(1)}°</strong></span>
      <span className="dt-sep">|</span>
      <span className="dt-label">ROLL  <strong>{roll.toFixed(1)}°</strong></span>
      <span className="dt-sep">|</span>
      <span className="dt-label">YAW   <strong>{yaw.toFixed(1)}°</strong></span>
    </div>
  );
}

// ── Componente público ─────────────────────────────────────────────────
/**
 * DigitalTwin — Visor CAD Táctico del cohete.
 *
 * React.memo previene re-renders del wrapper/Canvas cuando otras partes
 * del dashboard cambian. Toda la rotación ocurre en useFrame (GPU loop).
 *
 * Derivación de ángulos RAW (sin filtro Kalman):
 *   • pitch / roll → trigonometría directa del acelerómetro
 *   • yaw          → heading magnético del magnetómetro
 */
export const DigitalTwin = React.memo(function DigitalTwin({
  data,
}: {
  data: TelemetryData | null;
}) {
  // ── Ángulos RAW desde sensores IMU (sin Kalman) ────────────────────
  const ax = data?.acc_x ?? 0;
  const ay = data?.acc_y ?? 0;
  const az = data?.acc_z ?? 0;
  const mx = data?.mag_x ?? 0;
  const my = data?.mag_y ?? 0;

  const pitch_raw = Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * RAD2DEG;
  const roll_raw  = Math.atan2(ay, az) * RAD2DEG;
  const yaw_raw   = Math.atan2(-my, mx) * RAD2DEG; // heading magnético sin corrección

  return (
    <div className="digital-twin-container">
      <Canvas
        camera={{ position: [0, 0.5, 10], fov: 52, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        {/* Iluminación: ambiente suave + direccional para volumen en las partes sólidas */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]}  intensity={1.4} color="#ffffff" />
        <directionalLight position={[-4, 3, -4]} intensity={0.4} color="#aaccff" />

        <RocketModel
          pitch_raw={pitch_raw}
          roll_raw={roll_raw}
          yaw_raw={yaw_raw}
        />

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          zoomSpeed={0.7}
          panSpeed={0.5}
          rotateSpeed={0.6}
          minDistance={4}
          maxDistance={25}
          target={[0, 0, 0]}
        />
      </Canvas>

      {data && <AttitudeOverlay pitch={pitch_raw} roll={roll_raw} yaw={yaw_raw} />}
    </div>
  );
});

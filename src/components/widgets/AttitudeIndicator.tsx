import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { TelemetryData } from '../../types/Telemetry';
import './AttitudeIndicator.css';

interface AttitudeIndicatorProps {
  data: TelemetryData | null;
}

// ── Colors ───────────────────────────────────────────────────────────
const EARTH_COLOR   = '#7a3a10';  // solid earth brown
const SKY_COLOR     = '#1255a8';  // solid sky blue
const HORIZON_GLOW  = 'rgba(120, 190, 255, 0.28)'; // soft atmosphere rim

// Parallel latitude lines drawn on the sphere
const PARALLELS  = [-80, -60, -40, -20, 0, 20, 40, 60, 80];
// Meridian longitude lines (every 30°)
const MERIDIANS  = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const LINE_STEPS = 120;  // polyline resolution for grid lines

/**
 * Returns true if `test` angle lies on the DEFAULT (increasing-angle,
 * anticlockwise=false in canvas) arc from `start` to `end`.
 * All angles in radians; internally normalised to [0, 2π).
 */
function isOnDefaultArc(start: number, end: number, test: number): boolean {
  const n  = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const s = n(start), e = n(end), t = n(test);
  if (s <= e) return t >= s && t <= e;
  return t >= s || t <= e;  // arc wraps past 2π
}

/**
 * Projects a unit-sphere surface point (lat°, lon°) via rotation matrices
 * and a perspective divide onto canvas pixel coords.
 *
 * Rotation order matches CSS: rotateX(pitch) THEN rotateZ(roll).
 * Perspective distance = perspD × r (sphere radius in px).
 */
function sphereProject(
  latDeg: number,
  lonDeg: number,
  pitchR: number,  // pitch in radians
  rollR:  number,  // roll in radians
  cx: number, cy: number, r: number,
  perspD: number,  // perspective distance in units of r
): { sx: number; sy: number; depth: number } {
  const lat = latDeg * (Math.PI / 180);
  const lon = lonDeg * (Math.PI / 180);

  // Cartesian point on unit sphere (north pole = +Y)
  const x0 = Math.cos(lat) * Math.sin(lon);
  const y0 = Math.sin(lat);
  const z0 = Math.cos(lat) * Math.cos(lon);

  // rotateX(pitch) — around X axis
  const cp = Math.cos(pitchR), sp = Math.sin(pitchR);
  const x1 = x0;
  const y1 = y0 * cp - z0 * sp;
  const z1 = y0 * sp + z0 * cp;

  // rotateZ(roll) — around Z axis
  const cr = Math.cos(rollR), sr = Math.sin(rollR);
  const x2 = x1 * cr - y1 * sr;
  const y2 = x1 * sr + y1 * cr;
  const z2 = z1;

  // Perspective divide: perspD / (perspD - z2) magnifies close hemisphere
  const scale = perspD / (perspD - z2);

  return {
    sx:    cx + x2 * r * scale,
    sy:    cy - y2 * r * scale,   // canvas Y is inverted
    depth: z2,
  };
}

/** Main canvas draw routine — called on every pitch/roll change. */
function drawSphere(
  canvas: HTMLCanvasElement,
  pitchDeg: number,
  rollDeg: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Always draw at physical pixel coordinates (no ctx.scale applied here).
  const w  = canvas.width;
  const h  = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r  = Math.min(w, h) / 2 - 1;
  const perspD = 3.5;

  const pitchR = pitchDeg * (Math.PI / 180);
  const rollR  = rollDeg  * (Math.PI / 180);

  const proj = (lat: number, lon: number) =>
    sphereProject(lat, lon, pitchR, rollR, cx, cy, r, perspD);

  ctx.clearRect(0, 0, w, h);

  // ── Clip everything to the sphere circle ────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // ── 1 & 2. Earth / Sky solid two-half fill ─────────────────────────
  //
  // Approach: find where the horizon (equator) line intersects the sphere
  // silhouette circle, then fill the sky arc + chord in one path.
  //
  // This works at EVERY pitch/roll, including pitch=0 where the equator
  // ring degenerates to a flat line and polygon-based cap fills break.
  //
  // Horizon line geometry:
  //   • The line passes through eq0 = proj(0°, 0°) — the front-equator point.
  //   • Direction = (cos roll, -sin roll), derived from the left/right equator
  //     limb points which are always at depth=0 and screen-distance r from center.

  // Base fill — earth brown covers everything
  ctx.fillStyle = EARTH_COLOR;
  ctx.fillRect(0, 0, w, h);

  const eq0 = proj(0, 0);
  const hdx = Math.cos(rollR);
  const hdy = -Math.sin(rollR);

  // Intersect horizon line with sphere circle:
  //   P(t) = eq0 + t*(hdx, hdy);  |P - (cx,cy)|² = r²
  const ex = eq0.sx - cx;
  const ey = eq0.sy - cy;
  const lineB  = 2 * (ex * hdx + ey * hdy);
  const lineC  = ex * ex + ey * ey - r * r;
  const lineDet = lineB * lineB - 4 * lineC; // A=1

  const np = proj(90, 0); // north-pole screen position

  if (lineDet >= 0) {
    const sq  = Math.sqrt(lineDet);
    const t1  = (-lineB - sq) / 2;
    const t2  = (-lineB + sq) / 2;
    const ix1 = eq0.sx + t1 * hdx;
    const iy1 = eq0.sy + t1 * hdy;
    const ix2 = eq0.sx + t2 * hdx;
    const iy2 = eq0.sy + t2 * hdy;

    const a1  = Math.atan2(iy1 - cy, ix1 - cx);
    const a2  = Math.atan2(iy2 - cy, ix2 - cx);
    const aNP = Math.atan2(np.sy - cy, np.sx - cx);

    // Draw the sky half:
    //   moveTo ix1 → arc through north-pole side → straight chord back to ix1
    const skyAnticlockwise = !isOnDefaultArc(a1, a2, aNP);

    ctx.fillStyle = SKY_COLOR;
    ctx.beginPath();
    ctx.moveTo(ix1, iy1);
    ctx.arc(cx, cy, r, a1, a2, skyAnticlockwise);
    ctx.closePath(); // chord: ix2 → ix1
    ctx.fill();

    // Soft atmosphere glow along the horizon chord
    const horizGrad = ctx.createLinearGradient(
      (ix1 + ix2) / 2 - (iy2 - iy1) * 0.08,
      (iy1 + iy2) / 2 + (ix2 - ix1) * 0.08,
      (ix1 + ix2) / 2 + (iy2 - iy1) * 0.08,
      (iy1 + iy2) / 2 - (ix2 - ix1) * 0.08,
    );
    horizGrad.addColorStop(0,    'transparent');
    horizGrad.addColorStop(0.5, HORIZON_GLOW);
    horizGrad.addColorStop(1,   'transparent');
    ctx.fillStyle = horizGrad;
    ctx.fillRect(0, 0, w, h);
  } else {
    // Horizon doesn't cross — entire sphere is sky (north facing camera) or earth
    if (np.depth > 0) {
      ctx.fillStyle = SKY_COLOR;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ── 3. Specular highlight (glass gloss) ───────────────────────
  // A soft white oval in the upper-left area simulates light reflection.
  const spec = ctx.createRadialGradient(
    cx - r * 0.20, cy - r * 0.24, 0,
    cx - r * 0.20, cy - r * 0.24, r * 0.72,
  );
  spec.addColorStop(0,    'rgba(255,255,255,0.20)');
  spec.addColorStop(0.40, 'rgba(255,255,255,0.07)');
  spec.addColorStop(1,    'transparent');
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // ── 4. Spherical grid ────────────────────────────────────────
  const drawLine = (
    p0: { sx: number; sy: number; depth: number },
    p1: { sx: number; sy: number; depth: number },
    baseAlpha: number,
    width: number,
  ) => {
    if (Math.max(p0.depth, p1.depth) < -0.15) return;
    const alpha = Math.max(0.08, Math.min(baseAlpha,
      baseAlpha * (Math.max(p0.depth, p1.depth) * 0.6 + 0.7)));
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth   = width;
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.stroke();
  };

  // Parallels
  for (const lat of PARALLELS) {
    const isEquator = lat === 0;
    const pts = Array.from({ length: LINE_STEPS + 1 }, (_, i) =>
      proj(lat, (i / LINE_STEPS) * 360));
    if (isEquator) {
      // Horizon: draw a glow layer first, then the bright line on top
      for (let i = 0; i < LINE_STEPS; i++) {
        const p0 = pts[i]!, p1 = pts[i + 1]!;
        if (Math.max(p0.depth, p1.depth) < -0.15) continue;
        ctx.strokeStyle = 'rgba(100,180,255,0.25)';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
      }
    }
    for (let i = 0; i < LINE_STEPS; i++)
      drawLine(pts[i]!, pts[i + 1]!, isEquator ? 1.0 : 0.38, isEquator ? 2.5 : 1);
  }

  // Meridians
  for (const lon of MERIDIANS) {
    const pts = Array.from({ length: LINE_STEPS + 1 }, (_, i) =>
      proj(-90 + (i / LINE_STEPS) * 180, lon));
    for (let i = 0; i < LINE_STEPS; i++)
      drawLine(pts[i]!, pts[i + 1]!, 0.42, 1);
  }

  // ── 6. Vignette (limb darkening) ─────────────────────────────
  const vig = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
  vig.addColorStop(0,   'transparent');
  vig.addColorStop(0.7, 'rgba(0,0,0,0.18)');
  vig.addColorStop(1,   'rgba(0,0,0,0.62)');
  ctx.fillStyle = vig;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────
/**
 * Horizonte Artificial — Attitude Sphere
 *
 * Pitch y Roll calculados desde el acelerómetro IMU.
 * Canvas 2D con matrices de rotación + división perspectiva:
 * los meridianos convergen en los polos y los paralelos se
 * comprimen al acercarse a ellos, tal como en un FDAI real.
 */
function AttitudeIndicatorRaw({ data }: AttitudeIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { pitch, roll, connected } = useMemo(() => {
    if (!data) return { pitch: 0, roll: 0, connected: false };

    const ax = data.acc_x;
    const ay = data.acc_y;
    const az = data.acc_z;

    const rawRoll  = Math.atan2(ay, az)                             * (180 / Math.PI);
    const rawPitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * (180 / Math.PI);

    return {
      roll:  Math.round(rawRoll  * 10) / 10,
      pitch: Math.round(rawPitch * 10) / 10,
      connected: true,
    };
  }, [data]);

  // ── Animation: lerp-smoothed display values ──────────────────────
  // Refs for the RAF loop (no re-render cost).
  const targetPitchRef = useRef(0);
  const targetRollRef  = useRef(0);
  const animPitchRef   = useRef(0);
  const animRollRef    = useRef(0);
  const rafRef         = useRef<number>(0);

  // State only for SVG overlay (needs re-render to move the roll pointer + pitch ladder)
  const [svgRoll,  setSvgRoll]  = useState(0);
  const [svgPitch, setSvgPitch] = useState(0);

  // Keep target refs in sync with computed pitch/roll
  useEffect(() => {
    targetPitchRef.current = pitch;
    targetRollRef.current  = roll;
  }, [pitch, roll]);

  // Resize canvas to match CSS size (physical pixels, no ctx.scale)
  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(width  * dpr);
    canvas.height = Math.round(height * dpr);
  }, []);

  // ── RAF animation loop ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncSize();
    drawSphere(canvas, 0, 0);

    const SMOOTH = 0.13; // 0 = frozen, 1 = instant snap
    let svgUpdateCounter = 0;

    const loop = () => {
      const tp = targetPitchRef.current;
      const tr = targetRollRef.current;
      const ap = animPitchRef.current;
      const ar = animRollRef.current;

      const newP = ap + (tp - ap) * SMOOTH;
      const newR = ar + (tr - ar) * SMOOTH;

      const movedP = Math.abs(newP - ap) > 0.005;
      const movedR = Math.abs(newR - ar) > 0.005;

      if (movedP || movedR) {
        animPitchRef.current = movedP ? newP : tp;
        animRollRef.current  = movedR ? newR : tr;
        if (canvas.width > 0) drawSphere(canvas, animPitchRef.current, animRollRef.current);
        // Update SVG every ~3 frames to avoid flooding React with state updates
        if (++svgUpdateCounter % 3 === 0) {
          setSvgRoll(animRollRef.current);
          setSvgPitch(animPitchRef.current);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSize]);

  // Resize observer — keep canvas sharp when widget is resized
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      syncSize();
      drawSphere(canvas, animPitchRef.current, animRollRef.current);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [syncSize]);

  return (
    <div className="ai-wrapper">
      <span className="ai-title">HORIZONTE ARTIFICIAL</span>
      {!connected && <span className="ai-no-signal">SIN SEÑAL</span>}

      {/* Contenedor que acapara el espacio vertical sobrante */}
      <div className="ai-sphere-wrap">

      {/* ── Marco exterior (bisel) ── */}
      <div className="ai-bezel">

        {/* Perspectiva 3D — contenedor de la cámara */}
        <div className="ai-camera">

          {/* ── Canvas 3D: esfera completa con proyección perspectiva ──
              Meridianos convergen en los polos, paralelos se estrechan
              al acercarse a ellos. La vigneta se dibuja también en canvas. */}
          <canvas ref={canvasRef} className="ai-sphere-canvas" />

          {/* ── Pitch ladder ─────────────────────────────────────────
               Horizontal lines + degree labels that shift with pitch
               and rotate with roll, exactly like a real ADI.           */}
          {(() => {
            // px per degree of pitch in viewBox coords (200×200, r≈95)
            const PPD    = 1.55;
            const steps  = [-60, -50, -40, -30, -20, -10, 10, 20, 30, 40, 50, 60];
            const tX     = 0;
            const tY     = svgPitch * PPD;   // shift up when nose-up
            return (
              <svg
                className="ai-pitch-ladder"
                viewBox="0 0 200 200"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                {/* Clip to inner sphere circle so lines don't bleed outside */}
                <defs>
                  <clipPath id="ai-sphere-clip">
                    <circle cx="100" cy="100" r="88" />
                  </clipPath>
                </defs>

                <g
                  clipPath="url(#ai-sphere-clip)"
                  style={{
                    transform: `rotate(${-svgRoll}deg) translate(${tX}px, ${tY}px)`,
                    transformOrigin: '100px 100px',
                    transition: 'transform 80ms linear',
                  }}
                >
                  {/* Horizon centre line (0°) with labels at both ends */}
                  <line x1="30" y1="100" x2="170" y2="100"
                    stroke="rgba(255,255,255,0.90)" strokeWidth="1.5" />
                  <text x="24" y="100"
                    textAnchor="end" dominantBaseline="middle"
                    fontSize="7.5" fontFamily="monospace" fontWeight="bold"
                    fill="rgba(120,240,255,0.95)">0</text>
                  <text x="176" y="100"
                    textAnchor="start" dominantBaseline="middle"
                    fontSize="7.5" fontFamily="monospace" fontWeight="bold"
                    fill="rgba(120,240,255,0.95)">0</text>

                  {steps.map((deg) => {
                    const y      = 100 - deg * PPD;
                    const major  = deg % 20 === 0;
                    const half   = major ? 28 : 18;  // half-width of line
                    const skyDeg = deg > 0;          // sky = positive pitch
                    const col    = skyDeg ? 'rgba(180,218,255,0.88)' : 'rgba(255,196,140,0.88)';
                    const label  = `${deg > 0 ? '+' : ''}${deg}`;
                    const fs     = major ? 7.5 : 6.5;
                    return (
                      <g key={deg}>
                        {/* Left tick */}
                        <line
                          x1={100 - half} y1={y}
                          x2={100 - 8}   y2={y}
                          stroke={col} strokeWidth={major ? 1.5 : 1}
                        />
                        {/* Right tick */}
                        <line
                          x1={100 + 8}   y1={y}
                          x2={100 + half} y2={y}
                          stroke={col} strokeWidth={major ? 1.5 : 1}
                        />
                        {/* Small centre gap bracket (only major) */}
                        {major && (
                          <>
                            <line x1={100 - 8} y1={y} x2={100 - 8} y2={y + (deg > 0 ? 4 : -4)}
                              stroke={col} strokeWidth="1" />
                            <line x1={100 + 8} y1={y} x2={100 + 8} y2={y + (deg > 0 ? 4 : -4)}
                              stroke={col} strokeWidth="1" />
                          </>
                        )}
                        {/* Left label */}
                        <text
                          x={100 - half - 3} y={y}
                          textAnchor="end" dominantBaseline="middle"
                          fontSize={fs} fontFamily="monospace" fontWeight="bold"
                          fill={col}
                        >{label}</text>
                        {/* Right label */}
                        <text
                          x={100 + half + 3} y={y}
                          textAnchor="start" dominantBaseline="middle"
                          fontSize={fs} fontFamily="monospace" fontWeight="bold"
                          fill={col}
                        >{label}</text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            );
          })()}

          {/* ── Overlay estático: mira del cohete (z-index > canvas) ── */}
          <svg
            className="ai-reticle"
            viewBox="0 0 200 200"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Ala izquierda */}
            <line x1="18"  y1="100" x2="78"  y2="100" stroke="#f5f500" strokeWidth="3" strokeLinecap="round" />
            {/* Codo izquierdo */}
            <line x1="78"  y1="100" x2="78"  y2="112" stroke="#f5f500" strokeWidth="3" strokeLinecap="round" />
            {/* Ala derecha */}
            <line x1="122" y1="100" x2="182" y2="100" stroke="#f5f500" strokeWidth="3" strokeLinecap="round" />
            {/* Codo derecho */}
            <line x1="122" y1="100" x2="122" y2="112" stroke="#f5f500" strokeWidth="3" strokeLinecap="round" />
            {/* Punto central */}
            <circle cx="100" cy="100" r="4.5" fill="#f5f500" />
            {/* Triángulo de referencia superior (morro del cohete) */}
            <polygon points="100,80 94,91 106,91" fill="#f5f500" />
          </svg>

          {/* ── Arco de roll con marcas estáticas ── */}
          <svg
            className="ai-roll-arc"
            viewBox="0 0 200 200"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Arco de fondo */}
            <path
              d="M 38 100 A 62 62 0 0 1 162 100"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1.5"
            />

            {/* Marcas de roll: ±10, ±20, ±30, ±45, ±60 */}
            {[-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].map((deg) => {
              const rad    = ((deg - 90) * Math.PI) / 180;
              const major  = deg % 30 === 0;
              const outerR = 62;
              const innerR = outerR - (major ? 9 : 5);
              return (
                <line
                  key={deg}
                  x1={100 + innerR * Math.cos(rad)}
                  y1={100 + innerR * Math.sin(rad)}
                  x2={100 + outerR * Math.cos(rad)}
                  y2={100 + outerR * Math.sin(rad)}
                  stroke="rgba(255,255,255,0.65)"
                  strokeWidth={major ? 2 : 1}
                />
              );
            })}

            {/* Puntero dinámico de roll — CSS transition via <g> transform */}
            <g
              className="roll-pointer"
              style={{
                transform: `rotate(${-svgRoll}deg)`,
                transformOrigin: '100px 100px',
              }}
            >
              {(() => {
                const rad = (-90 * Math.PI) / 180; // points up (0°) in local space
                const tip = { x: 100 + 55 * Math.cos(rad), y: 100 + 55 * Math.sin(rad) };
                const l   = { x: 100 + 66 * Math.cos(rad - 0.13), y: 100 + 66 * Math.sin(rad - 0.13) };
                const r2  = { x: 100 + 66 * Math.cos(rad + 0.13), y: 100 + 66 * Math.sin(rad + 0.13) };
                return (
                  <polygon
                    points={`${tip.x},${tip.y} ${l.x},${l.y} ${r2.x},${r2.y}`}
                    fill="#f5f500"
                  />
                );
              })()}
            </g>
          </svg>

        </div>{/* /ai-camera */}
      </div>{/* /ai-bezel */}

      </div>{/* /ai-sphere-wrap */}

      {/* ── Lecturas numéricas ── */}
      <div className="ai-readings">
        <div className="ai-reading">
          <span className="ai-reading-label">PITCH</span>
          <span className="ai-reading-value">{connected ? `${pitch.toFixed(1)}°` : '--'}</span>
        </div>
        <div className="ai-reading">
          <span className="ai-reading-label">ROLL</span>
          <span className="ai-reading-value">{connected ? `${roll.toFixed(1)}°` : '--'}</span>
        </div>
      </div>
    </div>
  );
}

// React.memo: re-render solo cuando pitch o roll cambian (valores redondeados a 1 decimal)
export const AttitudeIndicator = React.memo(AttitudeIndicatorRaw);

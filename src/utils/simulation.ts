import { TelemetryData, MissionState } from '../types/Telemetry';

/**
 * Configuración de la simulación con física realista
 */
const SIMULATION_CONFIG = {
  // Duración total de la misión
  MISSION_DURATION: 300, // 5 minutos
  
  // Parámetros físicos del vuelo
  PHYSICS: {
    // Fase de ascenso motorizado
    MOTOR_BURN_TIME: 8,           // Duración del motor (segundos)
    MOTOR_THRUST_ACCEL: 80,       // Aceleración del motor (m/s²)
    MAX_VELOCITY: 180,            // Velocidad máxima alcanzada (m/s)
    LAUNCH_ANGLE: 70,             // Ángulo de lanzamiento desde vertical (grados)
    
    // Fase de ascenso balístico
    GRAVITY: 9.81,                // Aceleración gravitacional (m/s²)
    DRAG_COEFFICIENT: 0.015,      // Coeficiente de arrastre
    
    // Apogeo
    TARGET_APOGEE: 1200,          // Altitud objetivo (metros)
    
    // Descenso con paracaídas
    PARACHUTE_DESCENT_RATE: -5,  // Velocidad de descenso (m/s)
    PARACHUTE_DEPLOY_ALT: 1150,  // Altitud de despliegue (metros)
    
    // Deriva por viento (cambio por segundo)
    WIND_DRIFT_LAT: 0.000002,     // Deriva norte-sur (hacia el sur)
    WIND_DRIFT_LNG: 0.000003,     // Deriva este-oeste (hacia el este)
  },
  
  // Ubicación de lanzamiento (FIUNA)
  LAUNCH_SITE: {
    lat: -25.3316,
    lng: -57.5171,
    alt: 100, // MSL
  },
  
  // Tiempos de fase
  PHASES: {
    IDLE: 0,
    ARMED: 3,
    LIFTOFF: 5,
  }
};

/**
 * Estado interno de la simulación (persistente entre llamadas)
 */
class SimulationState {
  // Estado cinemático
  altitude: number = 0;
  velocity: number = 0;
  acceleration: number = 0;
  
  // Posición GPS
  lat: number = SIMULATION_CONFIG.LAUNCH_SITE.lat;
  lng: number = SIMULATION_CONFIG.LAUNCH_SITE.lng;
  
  // Orientación (grados)
  pitch: number = 0;
  roll: number = 0;
  yaw: number = 0;
  
  // Fase actual
  currentPhase: MissionState = MissionState.IDLE;
  
  // Tiempo del último update (para cálculo delta)
  lastUpdateTime: number = 0;
  
  // Flags de eventos
  motorBurnout: boolean = false;
  parachuteDeployed: boolean = false;
  hasLanded: boolean = false;
  
  reset() {
    this.altitude = 0;
    this.velocity = 0;
    this.acceleration = 0;
    this.lat = SIMULATION_CONFIG.LAUNCH_SITE.lat;
    this.lng = SIMULATION_CONFIG.LAUNCH_SITE.lng;
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
    this.currentPhase = MissionState.IDLE;
    this.lastUpdateTime = 0;
    this.motorBurnout = false;
    this.parachuteDeployed = false;
    this.hasLanded = false;
  }
}

// Instancia global del estado (persiste entre frames)
const simState = new SimulationState();


/**
 * Genera telemetría realista basada en modelo de física de estados
 * 
 * @param elapsedSeconds - Tiempo desde el inicio de la simulación
 * @returns Datos de telemetría con física realista
 */
export function generateFakeTelemetry(elapsedSeconds: number): TelemetryData {
  const { PHYSICS, LAUNCH_SITE, PHASES } = SIMULATION_CONFIG;
  
  // Delta time (segundos desde último frame)
  const dt = elapsedSeconds - simState.lastUpdateTime;
  simState.lastUpdateTime = elapsedSeconds;
  
  // ==================== MÁQUINA DE ESTADOS ====================
  
  // FASE 1: IDLE (0-3s)
  if (elapsedSeconds < PHASES.ARMED) {
    simState.currentPhase = MissionState.IDLE;
    simState.altitude = 0;
    simState.velocity = 0;
    simState.acceleration = 0;
    simState.pitch = 90; // Cohete vertical en rampa
    simState.roll = 0;
    simState.yaw = 0;
  }
  
  // FASE 2: ARMED (3-5s)
  else if (elapsedSeconds < PHASES.LIFTOFF) {
    simState.currentPhase = MissionState.ARMED;
    simState.pitch = 90;
    // Pequeña vibración pre-lanzamiento
    simState.roll = Math.sin(elapsedSeconds * 10) * 2;
  }
  
  // FASE 3: LIFTOFF + POWERED ASCENT (5s - 13s)
  else if (elapsedSeconds < PHASES.LIFTOFF + PHYSICS.MOTOR_BURN_TIME) {
    simState.currentPhase = MissionState.POWERED_FLIGHT;
    
    // Aceleración del motor (decrece linealmente hasta burnout)
    const burnProgress = (elapsedSeconds - PHASES.LIFTOFF) / PHYSICS.MOTOR_BURN_TIME;
    simState.acceleration = PHYSICS.MOTOR_THRUST_ACCEL * (1 - burnProgress * 0.3);
    
    // Actualizar velocidad
    simState.velocity += simState.acceleration * dt;
    
    // Componentes de velocidad según ángulo de lanzamiento (70° desde vertical)
    const launchAngleRad = (PHYSICS.LAUNCH_ANGLE * Math.PI) / 180;
    const verticalVelocity = simState.velocity * Math.cos(launchAngleRad);
    const horizontalVelocity = simState.velocity * Math.sin(launchAngleRad);
    
    // Actualizar altitud con componente vertical
    simState.altitude += verticalVelocity * dt;
    
    // Orientación durante ascenso motorizado (inclinado 70°)
    simState.pitch = PHYSICS.LAUNCH_ANGLE; // 70° de inclinación
    simState.roll = Math.sin(elapsedSeconds * 3) * 5; // Rotación leve
    simState.yaw += dt * 2; // Rotación lenta sobre su eje
    
    // Deriva por viento + desplazamiento horizontal por ángulo de lanzamiento
    simState.lat += (PHYSICS.WIND_DRIFT_LAT + horizontalVelocity * 0.000001) * dt;
    simState.lng += (PHYSICS.WIND_DRIFT_LNG + horizontalVelocity * 0.0000015) * dt;
  }
  
  // FASE 4: COASTING (Ascenso balístico sin motor)
  else if (!simState.motorBurnout || (simState.velocity > 0 && simState.altitude < PHYSICS.TARGET_APOGEE)) {
    simState.motorBurnout = true;
    simState.currentPhase = MissionState.COAST;
    
    // Física balística: solo gravedad y arrastre
    const dragForce = PHYSICS.DRAG_COEFFICIENT * simState.velocity * simState.velocity;
    simState.acceleration = -PHYSICS.GRAVITY - (simState.velocity > 0 ? dragForce : 0);
    
    // Actualizar cinemática
    simState.velocity += simState.acceleration * dt;
    simState.altitude += simState.velocity * dt;
    
    // Orientación inestable (perdiendo verticalidad)
    simState.pitch = 85 - (elapsedSeconds - 13) * 3; // Va inclinándose
    simState.roll = Math.sin(elapsedSeconds * 2) * 15; // Más inestable
    simState.yaw += dt * 5; // Rotación más rápida
    
    // Deriva continua por viento
    simState.lat += PHYSICS.WIND_DRIFT_LAT * dt * 1.5; // Mayor deriva a mayor altitud
    simState.lng += PHYSICS.WIND_DRIFT_LNG * dt * 1.5;
  }
  
  // FASE 5: APOGEE (Velocidad ~ 0)
  else if (simState.velocity <= 0 && !simState.parachuteDeployed) {
    simState.currentPhase = MissionState.APOGEE;
    simState.velocity = 0;
    
    // Momento de apogeo: orientación completamente inestable
    simState.pitch = 45 + Math.sin(elapsedSeconds * 4) * 20;
    simState.roll = Math.cos(elapsedSeconds * 3) * 30;
    simState.yaw += dt * 10; // Rotación rápida
    
    // Desplegar paracaídas después de 2 segundos en apogeo
    if (simState.altitude >= PHYSICS.PARACHUTE_DEPLOY_ALT - 50) {
      simState.parachuteDeployed = true;
    }
  }
  
  // FASE 6: DESCENT (Paracaídas desplegado)
  else if (simState.parachuteDeployed && simState.altitude > 0) {
    simState.currentPhase = MissionState.DESCENT;
    
    // Descenso controlado a velocidad constante
    simState.velocity = PHYSICS.PARACHUTE_DESCENT_RATE;
    simState.acceleration = 0.5; // Pequeña aceleración residual
    
    // Actualizar altitud
    simState.altitude += simState.velocity * dt;
    
    // Prevenir altitud negativa
    if (simState.altitude < 0) {
      simState.altitude = 0;
      simState.velocity = 0;
      simState.hasLanded = true;
    }
    
    // Orientación con paracaídas: balanceo pendular
    simState.pitch = 10 + Math.sin(elapsedSeconds * 0.5) * 8;
    simState.roll = Math.cos(elapsedSeconds * 0.7) * 12;
    simState.yaw += dt * 3; // Rotación lenta
    
    // Deriva continua pero más lenta (cerca del suelo)
    const altitudeFactor = Math.max(0.3, simState.altitude / 1000);
    simState.lat += PHYSICS.WIND_DRIFT_LAT * dt * altitudeFactor;
    simState.lng += PHYSICS.WIND_DRIFT_LNG * dt * altitudeFactor;
  }
  
  // FASE 7: LANDED
  else if (simState.hasLanded || simState.altitude <= 0) {
    simState.currentPhase = MissionState.LANDED;
    simState.altitude = 0;
    simState.velocity = 0;
    simState.acceleration = 1; // 1G en reposo
    simState.pitch = 0; // Horizontal en el suelo
    simState.roll = 0;
    simState.yaw = 0;
  }
  
  // ==================== GENERAR TELEMETRÍA ====================
  
  return {
    // Sistema
    packet_id: Math.floor(elapsedSeconds * 10),
    mission_state: simState.currentPhase,
    mission_time: elapsedSeconds,
    timestamp: Date.now(),
    
    // Energía (descarga gradual)
    battery_voltage: 12.6 - (elapsedSeconds / SIMULATION_CONFIG.MISSION_DURATION) * 1.6,
    
    // Barómetro
    pressure: calculatePressure(simState.altitude),
    temperature: calculateTemperature(simState.altitude),
    altitude: simState.altitude,
    velocity_z: simState.velocity,
    
    // GPS
    gps_lat: simState.lat,
    gps_lng: simState.lng,
    gps_alt: simState.altitude + LAUNCH_SITE.alt,
    gps_sats: 8 + Math.floor(Math.sin(elapsedSeconds * 0.1) * 3),
    
    // Acelerómetro (derivado de aceleración + ruido)
    acc_x: (Math.random() - 0.5) * 0.3,
    acc_y: (Math.random() - 0.5) * 0.3,
    acc_z: simState.acceleration + (Math.random() - 0.5) * 0.2,
    
    // Giroscopio (rotación angular en °/s)
    gyro_x: simState.pitch + (Math.random() - 0.5) * 3,  // Pitch rate
    gyro_y: simState.yaw + (Math.random() - 0.5) * 3,    // Yaw rate
    gyro_z: simState.roll + (Math.random() - 0.5) * 3,   // Roll rate
    
    // Magnetómetro (campo magnético terrestre en Paraguay)
    mag_x: 15 + Math.sin(elapsedSeconds * 0.3) * 3,
    mag_y: -10 + Math.cos(elapsedSeconds * 0.4) * 2,
    mag_z: -18 + Math.sin(elapsedSeconds * 0.2),
    
    // LoRa (señal degrada con altitud)
    lora_rssi: -65 - (simState.altitude / 100) + (Math.random() - 0.5) * 5,
    lora_snr: 10 - (simState.altitude / 500) + (Math.random() - 0.5) * 2,
  };
}


/**
 * Calcula presión atmosférica según altitud (fórmula barométrica)
 */
function calculatePressure(altitude: number): number {
  const P0 = 1013.25; // hPa al nivel del mar
  const H = 8500; // Altura de escala atmosférica
  return P0 * Math.exp(-altitude / H);
}

/**
 * Calcula temperatura según altitud (gradiente térmico)
 */
function calculateTemperature(altitude: number): number {
  const T0 = 26; // °C en Asunción
  const gradient = -6.5 / 1000; // °C/metro
  return T0 + gradient * altitude;
}

/**
 * Reinicia el estado de la simulación (útil para múltiples runs)
 */
export function resetSimulation(): void {
  simState.reset();
}

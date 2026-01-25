import { TelemetryData, MissionState } from '../types/Telemetry';

/**
 * Configuración de la simulación
 */
const SIMULATION_CONFIG = {
  // Duración de la misión simulada en segundos
  MISSION_DURATION: 180, // 3 minutos
  
  // Fases de vuelo (en segundos)
  PHASES: {
    ARMED: 5,
    POWERED_FLIGHT: 10,
    COAST: 30,
    APOGEE: 45,
    DESCENT: 120,
    LANDED: 180
  },
  
  // Parámetros de vuelo
  MAX_ALTITUDE: 1500, // metros
  MAX_VELOCITY: 120,  // m/s
  MAX_ACCELERATION: 8, // G
  
  // Ubicación base (Lima, Perú - CCTE)
  BASE_LOCATION: {
    lat: -12.0464,
    lng: -77.0428,
    alt: 154
  }
};

/**
 * Genera datos de telemetría falsos para simulación
 * Simula un vuelo completo de cohete con todas las fases
 * 
 * @param elapsedSeconds - Tiempo transcurrido desde el inicio de la simulación
 * @returns Datos de telemetría sintéticos
 */
export function generateFakeTelemetry(elapsedSeconds: number): TelemetryData {
  // Calcular estado de misión basado en tiempo
  const missionState = getMissionState(elapsedSeconds);
  
  // Calcular fase de vuelo
  const flightPhase = getFlightPhase(elapsedSeconds);
  
  // Generar datos según la fase
  return {
    // ========== SISTEMA ==========
    packet_id: Math.floor(elapsedSeconds * 10), // 10 paquetes/segundo
    mission_state: missionState,
    mission_time: elapsedSeconds,
    timestamp: Date.now(),
    
    // ========== ENERGÍA ==========
    battery_voltage: simulateBatteryVoltage(elapsedSeconds),
    
    // ========== BARÓMETRO ==========
    pressure: simulatePressure(flightPhase.altitude),
    temperature: simulateTemperature(flightPhase.altitude),
    altitude: flightPhase.altitude,
    velocity_z: flightPhase.velocity,
    
    // ========== GPS ==========
    gps_lat: simulateGPSLat(elapsedSeconds, flightPhase.altitude),
    gps_lng: simulateGPSLng(elapsedSeconds, flightPhase.altitude),
    gps_alt: flightPhase.altitude + SIMULATION_CONFIG.BASE_LOCATION.alt,
    gps_sats: simulateGPSSatellites(elapsedSeconds),
    
    // ========== IMU: ACELERÓMETRO ==========
    acc_x: simulateAcceleration('x', elapsedSeconds, flightPhase),
    acc_y: simulateAcceleration('y', elapsedSeconds, flightPhase),
    acc_z: simulateAcceleration('z', elapsedSeconds, flightPhase),
    
    // ========== IMU: GIROSCOPIO ==========
    gyro_x: simulateGyro('x', elapsedSeconds, flightPhase),
    gyro_y: simulateGyro('y', elapsedSeconds, flightPhase),
    gyro_z: simulateGyro('z', elapsedSeconds, flightPhase),
    
    // ========== IMU: MAGNETÓMETRO ==========
    mag_x: simulateMagnetometer('x', elapsedSeconds),
    mag_y: simulateMagnetometer('y', elapsedSeconds),
    mag_z: simulateMagnetometer('z', elapsedSeconds),
    
    // ========== LoRa ==========
    lora_rssi: simulateLoRaRSSI(flightPhase.altitude),
    lora_snr: simulateLoRaSNR(flightPhase.altitude)
  };
}

/**
 * Determina el estado de la misión según el tiempo transcurrido
 */
function getMissionState(time: number): MissionState {
  if (time < SIMULATION_CONFIG.PHASES.ARMED) return MissionState.IDLE;
  if (time < SIMULATION_CONFIG.PHASES.POWERED_FLIGHT) return MissionState.ARMED;
  if (time < SIMULATION_CONFIG.PHASES.COAST) return MissionState.POWERED_FLIGHT;
  if (time < SIMULATION_CONFIG.PHASES.APOGEE) return MissionState.COAST;
  if (time < SIMULATION_CONFIG.PHASES.DESCENT) return MissionState.APOGEE;
  if (time < SIMULATION_CONFIG.PHASES.LANDED) return MissionState.DESCENT;
  return MissionState.LANDED;
}

/**
 * Calcula parámetros de vuelo según la fase
 */
function getFlightPhase(time: number): { altitude: number; velocity: number; acceleration: number } {
  const { PHASES, MAX_ALTITUDE, MAX_VELOCITY, MAX_ACCELERATION } = SIMULATION_CONFIG;
  
  // Fase 1: Idle/Armed (0-10s)
  if (time < PHASES.POWERED_FLIGHT) {
    return { altitude: 0, velocity: 0, acceleration: 1 };
  }
  
  // Fase 2: Ascenso motorizado (10-30s)
  if (time < PHASES.COAST) {
    const t = (time - PHASES.POWERED_FLIGHT) / (PHASES.COAST - PHASES.POWERED_FLIGHT);
    return {
      altitude: MAX_ALTITUDE * 0.3 * t * t, // Aceleración cuadrática
      velocity: MAX_VELOCITY * t,
      acceleration: MAX_ACCELERATION * (1 - t * 0.5)
    };
  }
  
  // Fase 3: Ascenso balístico (30-45s)
  if (time < PHASES.APOGEE) {
    const t = (time - PHASES.COAST) / (PHASES.APOGEE - PHASES.COAST);
    return {
      altitude: MAX_ALTITUDE * (0.3 + 0.7 * (1 - (1 - t) * (1 - t))), // Desaceleración
      velocity: MAX_VELOCITY * (1 - t),
      acceleration: 1 - t * 2
    };
  }
  
  // Fase 4: Apogeo (45s)
  if (time < PHASES.APOGEE + 5) {
    return {
      altitude: MAX_ALTITUDE,
      velocity: 0,
      acceleration: 0
    };
  }
  
  // Fase 5: Descenso con paracaídas (45-180s)
  if (time < PHASES.LANDED) {
    const t = (time - PHASES.APOGEE) / (PHASES.LANDED - PHASES.APOGEE);
    return {
      altitude: MAX_ALTITUDE * (1 - t),
      velocity: -8, // Descenso constante con paracaídas
      acceleration: 0.5
    };
  }
  
  // Fase 6: Aterrizado
  return { altitude: 0, velocity: 0, acceleration: 1 };
}

/**
 * Simula el voltaje de batería (baja gradualmente)
 */
function simulateBatteryVoltage(time: number): number {
  const initialVoltage = 12.6;
  const finalVoltage = 11.0;
  const dischargeCurve = time / SIMULATION_CONFIG.MISSION_DURATION;
  
  return initialVoltage - (initialVoltage - finalVoltage) * dischargeCurve;
}

/**
 * Simula presión atmosférica según altitud
 * Fórmula barométrica: P = P0 * exp(-h/H)
 */
function simulatePressure(altitude: number): number {
  const P0 = 1013.25; // Presión al nivel del mar (hPa)
  const H = 8500; // Altura de escala atmosférica (m)
  
  return P0 * Math.exp(-altitude / H);
}

/**
 * Simula temperatura según altitud
 * Gradiente térmico: -6.5°C por cada 1000m
 */
function simulateTemperature(altitude: number): number {
  const T0 = 22; // Temperatura base (°C)
  const gradient = -6.5 / 1000; // °C/m
  
  return T0 + gradient * altitude;
}

/**
 * Simula latitud GPS con deriva circular pequeña
 */
function simulateGPSLat(time: number, altitude: number): number {
  const { lat } = SIMULATION_CONFIG.BASE_LOCATION;
  
  // Radio de deriva en grados (más grande a mayor altitud)
  const driftRadius = (altitude / 1000) * 0.001;
  
  // Movimiento circular lento
  const angle = time * 0.1; // rad/s
  
  return lat + driftRadius * Math.sin(angle);
}

/**
 * Simula longitud GPS con deriva circular pequeña
 */
function simulateGPSLng(time: number, altitude: number): number {
  const { lng } = SIMULATION_CONFIG.BASE_LOCATION;
  
  const driftRadius = (altitude / 1000) * 0.001;
  const angle = time * 0.1;
  
  return lng + driftRadius * Math.cos(angle);
}

/**
 * Simula número de satélites GPS (varía entre 4 y 12)
 */
function simulateGPSSatellites(time: number): number {
  // Oscilación suave entre 6 y 11 satélites
  const base = 8.5;
  const amplitude = 2.5;
  const frequency = 0.05;
  
  return Math.round(base + amplitude * Math.sin(time * frequency));
}

/**
 * Simula aceleración en un eje
 */
function simulateAcceleration(
  axis: 'x' | 'y' | 'z',
  time: number,
  phase: { altitude: number; velocity: number; acceleration: number }
): number {
  const noise = (Math.random() - 0.5) * 0.2; // Ruido ±0.1G
  
  switch (axis) {
    case 'x':
      // Oscilación lateral leve
      return 0.1 * Math.sin(time * 2) + noise;
      
    case 'y':
      // Oscilación lateral leve (perpendicular a X)
      return 0.1 * Math.cos(time * 2) + noise;
      
    case 'z':
      // Aceleración vertical (1G en reposo, mayor durante ascenso)
      return phase.acceleration + noise;
      
    default:
      return 0;
  }
}

/**
 * Simula velocidad angular del giroscopio
 */
function simulateGyro(
  axis: 'x' | 'y' | 'z',
  time: number,
  phase: { altitude: number; velocity: number }
): number {
  const noise = (Math.random() - 0.5) * 5; // Ruido ±2.5°/s
  
  switch (axis) {
    case 'x':
      // Pitch: Oscilación de cabeceo
      return 15 * Math.sin(time * 0.5) + noise;
      
    case 'y':
      // Roll: Oscilación de alabeo
      return 12 * Math.cos(time * 0.7) + noise;
      
    case 'z':
      // Yaw: Rotación lenta continua
      return (phase.velocity > 0 ? 20 : 5) + noise;
      
    default:
      return noise;
  }
}

/**
 * Simula campo magnético
 */
function simulateMagnetometer(axis: 'x' | 'y' | 'z', time: number): number {
  const noise = (Math.random() - 0.5) * 2; // Ruido ±1µT
  
  // Campo magnético terrestre típico en Lima: ~25µT
  switch (axis) {
    case 'x':
      return 18 + 3 * Math.sin(time * 0.3) + noise;
      
    case 'y':
      return -12 + 2 * Math.cos(time * 0.4) + noise;
      
    case 'z':
      return 42 + Math.sin(time * 0.2) + noise;
      
    default:
      return noise;
  }
}

/**
 * Simula RSSI de LoRa (se degrada con altitud)
 */
function simulateLoRaRSSI(altitude: number): number {
  const baseRSSI = -65; // dBm en tierra
  const degradation = altitude / 100; // -1dBm por cada 100m
  const noise = (Math.random() - 0.5) * 5;
  
  return Math.max(-120, baseRSSI - degradation + noise);
}

/**
 * Simula SNR de LoRa
 */
function simulateLoRaSNR(altitude: number): number {
  const baseSNR = 10; // dB
  const degradation = altitude / 500; // Baja con altitud
  const noise = (Math.random() - 0.5) * 2;
  
  return Math.max(-10, baseSNR - degradation + noise);
}

import { TelemetryData, MissionState } from '../types/Telemetry';

/**
 * Tipo de paquete recibido (Telemetría de Enlace Dual)
 */
export type PacketType = 'F' | 'S' | 'UNKNOWN';

/**
 * Resultado extendido del parser con tipo de paquete
 */
export interface ParsedTelemetry {
  data: TelemetryData;
  packetType: PacketType;
}

/**
 * Parsea un string de telemetría con soporte para enlace dual + número de secuencia explícito
 * 
 * NUEVO FORMATO INDEXADO ESTRICTO (Hardware):
 * 
 * PACKET 'F' (Full Data - 500,000 baud):
 * Índice 0: 'F' (Identificador de paquete completo)
 * Índice 1: Packet ID (Número de secuencia entero, ej: 1024)
 * Índice 2: Mission Time (Tiempo de misión en segundos con decimales, ej: 45.234)
 * Índice 3: Altitude (m)
 * Índice 4: Velocity Z (m/s)
 * Índice 5: Accel X (G)
 * Índice 6: Accel Y (G)
 * Índice 7: Accel Z (G)
 * Índice 8: Gyro X (°/s)
 * Índice 9: Gyro Y (°/s)
 * Índice 10: Gyro Z (°/s)
 * Índice 11: Mag X (µT)
 * Índice 12: Mag Y (µT)
 * Índice 13: Mag Z (µT)
 * Índice 14: GPS Lat (grados)
 * Índice 15: GPS Lng (grados)
 * Índice 16: GPS Alt (m)
 * Índice 17: GPS Sats (cantidad)
 * Índice 18: Pressure (hPa)
 * Índice 19: Temperature (°C)
 * Índice 20: Battery Voltage (V)
 * Índice 21: Mission State (0-6)
 * Índice 22: LoRa RSSI (dBm)
 * Índice 23: LoRa SNR (dB)
 * 
 * Ejemplo: F,1024,45.234,245.3,15.2,0.5,-0.2,9.8,10.5,-5.3,2.1,25.3,15.2,-42.1,-25.2637,-57.5759,245.8,8,1013.25,22.5,12.1,2,-60,8.5
 * 
 * PACKET 'S' (Survival - LoRa de respaldo):
 * Índice 0: 'S'
 * Índice 1: Packet ID
 * Índice 2: Mission Time
 * Índice 3: GPS Lat
 * Índice 4: GPS Lng
 * Índice 5: Altitude
 * 
 * Ejemplo: S,1025,46.100,-25.2638,-57.5760,250.5
 * 
 * @param raw - String crudo recibido por serial con formato estricto indexado
 * @returns ParsedTelemetry con datos y tipo de paquete, o null si hay error
 */
export function parseTelemetryString(raw: string): ParsedTelemetry | null {
  try {
    // Eliminar espacios y saltos de línea
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Separar por comas
    const fields = trimmed.split(',').map(f => f.trim());
    
    if (fields.length < 3) {
      console.warn('[WARN] Paquete incompleto (menos de 3 campos):', raw);
      return null;
    }

    // ========== LEER IDENTIFICADOR DE PAQUETE (ÍNDICE 0) ==========
    const packetType = (fields[0] ?? '').toUpperCase();
    
    if (packetType !== 'F' && packetType !== 'S') {
      console.warn('[WARN] Identificador de paquete inválido:', packetType);
      return null;
    }

    // ========== LEER CAMPOS COMUNES (ÍNDICES 1-2) ==========
    const packetId = parseInt(fields[1] ?? '0', 10);
    const missionTimeRaw = parseFloat(fields[2] ?? '0');
    
    // Convertir de milisegundos a segundos si el valor es muy grande (>1000)
    const missionTime = missionTimeRaw > 1000 ? missionTimeRaw / 1000 : missionTimeRaw;
    
    if (isNaN(packetId) || isNaN(missionTime)) {
      console.warn('[WARN] Packet ID o Mission Time inválido:', fields[1], fields[2]);
      return null;
    }

    const timestamp = Date.now();

    // ========== PAQUETE 'S' (SURVIVAL/LoRa) ==========
    if (packetType === 'S') {
      if (fields.length < 6) {
        console.warn('[WARN] Paquete S incompleto (esperado 6 campos):', fields.length);
        return null;
      }

      const gpsLat = parseFloat(fields[3] ?? '0');
      const gpsLng = parseFloat(fields[4] ?? '0');
      const altitude = parseFloat(fields[5] ?? '0');

      if (isNaN(gpsLat) || isNaN(gpsLng) || isNaN(altitude)) {
        console.warn('[WARN] Datos GPS/ALT inválidos en paquete S');
        return null;
      }

      const telemetryData: TelemetryData = {
        // Sistema
        packet_id: packetId,
        mission_state: MissionState.POWERED_FLIGHT, // Asumimos vuelo activo
        mission_time: missionTime,
        timestamp: timestamp,
        
        // Energía (defaults - no disponible en survival)
        battery_voltage: 0,
        
        // Barómetro
        pressure: 1013.25, // Default
        temperature: 0,
        altitude: altitude,
        velocity_z: 0, // No disponible en survival
        
        // GPS (datos críticos del survival)
        gps_lat: gpsLat,
        gps_lng: gpsLng,
        gps_alt: altitude, // Usamos la misma altitud
        gps_sats: 0, // No disponible
        
        // IMU: Acelerómetro (defaults)
        acc_x: 0,
        acc_y: 0,
        acc_z: 0,
        
        // IMU: Giroscopio (defaults)
        gyro_x: 0,
        gyro_y: 0,
        gyro_z: 0,
        
        // IMU: Magnetómetro (defaults)
        mag_x: 0,
        mag_y: 0,
        mag_z: 0,
        
        // LoRa (defaults)
        lora_rssi: -120,
        lora_snr: 0,
      };

      return {
        data: telemetryData,
        packetType: 'S'
      };
    }

    // ========== PAQUETE 'F' (FULL DATA) ==========
    if (fields.length < 24) {
      console.warn('[WARN] Paquete F incompleto (esperado 24 campos):', fields.length);
      return null;
    }

    // Parsear todos los campos según el índice estricto
    const altitude = parseFloat(fields[3] ?? '0');
    const velocityZ = parseFloat(fields[4] ?? '0');
    const accX = parseFloat(fields[5] ?? '0');
    const accY = parseFloat(fields[6] ?? '0');
    const accZ = parseFloat(fields[7] ?? '0');
    const gyroX = parseFloat(fields[8] ?? '0');
    const gyroY = parseFloat(fields[9] ?? '0');
    const gyroZ = parseFloat(fields[10] ?? '0');
    const magX = parseFloat(fields[11] ?? '0');
    const magY = parseFloat(fields[12] ?? '0');
    const magZ = parseFloat(fields[13] ?? '0');
    const gpsLat = parseFloat(fields[14] ?? '0');
    const gpsLng = parseFloat(fields[15] ?? '0');
    const gpsAlt = parseFloat(fields[16] ?? '0');
    const gpsSats = parseInt(fields[17] ?? '0', 10);
    const pressure = parseFloat(fields[18] ?? '0');
    const temperature = parseFloat(fields[19] ?? '0');
    const batteryVoltage = parseFloat(fields[20] ?? '0');
    const missionState = parseInt(fields[21] ?? '0', 10);
    const loraRssi = parseFloat(fields[22] ?? '0');
    const loraSnr = parseFloat(fields[23] ?? '0');

    // Validación básica de NaN
    const values = [
      altitude, velocityZ, accX, accY, accZ,
      gyroX, gyroY, gyroZ, magX, magY, magZ,
      gpsLat, gpsLng, gpsAlt, gpsSats,
      pressure, temperature, batteryVoltage, missionState,
      loraRssi, loraSnr
    ];

    if (values.some(v => isNaN(v))) {
      console.warn('[WARN] Campos con NaN detectados en paquete F');
      return null;
    }

    const telemetryData: TelemetryData = {
      // Sistema
      packet_id: packetId,
      mission_state: missionState,
      mission_time: missionTime,
      timestamp: timestamp,
      
      // Energía
      battery_voltage: batteryVoltage,
      
      // Barómetro
      pressure: pressure,
      temperature: temperature,
      altitude: altitude,
      velocity_z: velocityZ,
      
      // GPS
      gps_lat: gpsLat,
      gps_lng: gpsLng,
      gps_alt: gpsAlt,
      gps_sats: gpsSats,
      
      // IMU: Acelerómetro
      acc_x: accX,
      acc_y: accY,
      acc_z: accZ,
      
      // IMU: Giroscopio
      gyro_x: gyroX,
      gyro_y: gyroY,
      gyro_z: gyroZ,
      
      // IMU: Magnetómetro
      mag_x: magX,
      mag_y: magY,
      mag_z: magZ,
      
      // LoRa
      lora_rssi: loraRssi,
      lora_snr: loraSnr,
    };

    return {
      data: telemetryData,
      packetType: 'F'
    };

  } catch (error) {
    console.error('[ERROR] Error parseando telemetría:', error, 'Raw:', raw);
    return null;
  }
}

/**
 * Valida que los datos de telemetría sean coherentes
 * Solo verifica estructura básica, NO limita valores de sensores
 */
export function validateTelemetryData(data: TelemetryData): boolean {
  // Validaciones mínimas de sistema
  if (data.packet_id < 0) return false;
  if (data.timestamp <= 0) return false;
  if (data.mission_time < 0) return false;
  
  // Validar que no haya NaN (valores numéricos corruptos)
  if (isNaN(data.altitude)) return false;
  if (isNaN(data.velocity_z)) return false;
  if (isNaN(data.acc_x) || isNaN(data.acc_y) || isNaN(data.acc_z)) return false;
  if (isNaN(data.battery_voltage)) return false;
  
  // Sin límites: todos los valores de sensores son aceptados
  return true;
}

/**
 * Calcula la magnitud vectorial de aceleración (G total)
 */
export function calculateAccelMagnitude(data: TelemetryData): number {
  return Math.sqrt(
    data.acc_x ** 2 + 
    data.acc_y ** 2 + 
    data.acc_z ** 2
  );
}

/**
 * Calcula el heading (rumbo) basado en magnetómetro
 * @returns Heading en grados (0-360, donde 0 es Norte)
 */
export function calculateMagneticHeading(data: TelemetryData): number {
  const heading = Math.atan2(data.mag_y, data.mag_x) * (180 / Math.PI);
  return heading < 0 ? heading + 360 : heading;
}

/**
 * Formatea el estado de misión como string legible
 */
export function formatMissionState(state: number): string {
  const states: Record<number, string> = {
    0: 'En Espera',
    1: 'Armado',
    2: 'Ascenso Motorizado',
    3: 'Ascenso Balístico',
    4: 'Apogeo',
    5: 'Descenso',
    6: 'Aterrizado',
    99: 'Error'
  };
  return states[state] ?? 'Desconocido';
}

import { TelemetryData, MissionState } from '../types/Telemetry';

/**
 * Parsea un string de telemetría crudo del Arduino
 * 
 * Formato esperado (claves cortas para optimizar ancho de banda LoRa):
 * "PID:1234;STATE:2;TIME:45.3;BAT:12.1;P:1013.25;T:22.5;ALT:150.2;VZ:25.3;LAT:-33.4489;LNG:-70.6693;GALT:148.5;SATS:8;AX:0.05;AY:-0.02;AZ:9.85;GX:0.5;GY:-0.3;GZ:0.1;MX:25.4;MY:-12.3;MZ:42.1;RSSI:-85;SNR:8.5;"
 * 
 * Mapa de claves cortas a campos de TelemetryData:
 * - PID -> packet_id
 * - STATE -> mission_state
 * - TIME -> mission_time
 * - BAT -> battery_voltage
 * - P -> pressure
 * - T -> temperature
 * - ALT -> altitude
 * - VZ -> velocity_z
 * - LAT -> gps_lat
 * - LNG -> gps_lng
 * - GALT -> gps_alt
 * - SATS -> gps_sats
 * - AX, AY, AZ -> acc_x, acc_y, acc_z
 * - GX, GY, GZ -> gyro_x, gyro_y, gyro_z
 * - MX, MY, MZ -> mag_x, mag_y, mag_z
 * - RSSI -> lora_rssi
 * - SNR -> lora_snr
 * 
 * @param raw - String crudo recibido por serial/LoRa
 * @returns TelemetryData parseado o null si hay error
 */
export function parseTelemetryString(raw: string): TelemetryData | null {
  try {
    // Eliminar espacios y saltos de línea
    const cleaned = raw.trim();
    if (!cleaned) return null;

    // Separar pares clave:valor
    const pairs = cleaned.split(';').filter(pair => pair.includes(':'));
    
    if (pairs.length === 0) return null;

    // Objeto temporal para almacenar valores parseados
    const parsed: Record<string, number> = {};

    // Parsear cada par clave:valor
    for (const pair of pairs) {
      const [key, value] = pair.split(':');
      
      if (!key || value === undefined) continue;
      
      const numValue = parseFloat(value);
      
      if (!isNaN(numValue)) {
        parsed[key.trim().toUpperCase()] = numValue;
      }
    }

    // Mapear claves cortas del Arduino a la interfaz TelemetryData
    const telemetryData: TelemetryData = {
      // Sistema
      packet_id: parsed['PID'] ?? parsed['PACKET_ID'] ?? 0,
      mission_state: parsed['STATE'] ?? parsed['MISSION_STATE'] ?? MissionState.IDLE,
      mission_time: parsed['TIME'] ?? parsed['MISSION_TIME'] ?? parsed['MT'] ?? 0,
      timestamp: parsed['TS'] ?? parsed['TIMESTAMP'] ?? Date.now(),
      
      // Energía
      battery_voltage: parsed['BAT'] ?? parsed['BATTERY'] ?? parsed['BATTERY_VOLTAGE'] ?? 0,
      
      // Barómetro
      pressure: parsed['P'] ?? parsed['PRESSURE'] ?? 1013.25,
      temperature: parsed['T'] ?? parsed['TEMP'] ?? parsed['TEMPERATURE'] ?? 0,
      altitude: parsed['ALT'] ?? parsed['ALTITUDE'] ?? 0,
      velocity_z: parsed['VZ'] ?? parsed['VEL_Z'] ?? parsed['VELOCITY_Z'] ?? 0,
      
      // GPS
      gps_lat: parsed['LAT'] ?? parsed['GPS_LAT'] ?? 0,
      gps_lng: parsed['LNG'] ?? parsed['LON'] ?? parsed['GPS_LNG'] ?? 0,
      gps_alt: parsed['GALT'] ?? parsed['GPS_ALT'] ?? 0,
      gps_sats: parsed['SATS'] ?? parsed['GPS_SATS'] ?? 0,
      
      // IMU: Acelerómetro (en G, donde 1G = 9.81 m/s²)
      acc_x: parsed['AX'] ?? parsed['ACC_X'] ?? parsed['ACCEL_X'] ?? 0,
      acc_y: parsed['AY'] ?? parsed['ACC_Y'] ?? parsed['ACCEL_Y'] ?? 0,
      acc_z: parsed['AZ'] ?? parsed['ACC_Z'] ?? parsed['ACCEL_Z'] ?? 1, // 1G en reposo
      
      // IMU: Giroscopio (en °/s)
      gyro_x: parsed['GX'] ?? parsed['GYRO_X'] ?? 0,
      gyro_y: parsed['GY'] ?? parsed['GYRO_Y'] ?? 0,
      gyro_z: parsed['GZ'] ?? parsed['GYRO_Z'] ?? 0,
      
      // IMU: Magnetómetro (en µT)
      mag_x: parsed['MX'] ?? parsed['MAG_X'] ?? 0,
      mag_y: parsed['MY'] ?? parsed['MAG_Y'] ?? 0,
      mag_z: parsed['MZ'] ?? parsed['MAG_Z'] ?? 0,
      
      // LoRa
      lora_rssi: parsed['RSSI'] ?? parsed['LORA_RSSI'] ?? -120,
      lora_snr: parsed['SNR'] ?? parsed['LORA_SNR'] ?? 0,
    };

    return telemetryData;
  } catch (error) {
    console.error('Error parsing telemetry string:', error, 'Raw:', raw);
    return null;
  }
}

/**
 * Valida que los datos de telemetría sean coherentes
 * Útil para filtrar paquetes corruptos
 */
export function validateTelemetryData(data: TelemetryData): boolean {
  // Validaciones de sistema
  if (data.timestamp <= 0) return false;
  if (data.mission_time < 0) return false;
  if (data.mission_state < 0 || data.mission_state > 99) return false;
  
  // Validar energía
  if (data.battery_voltage < 0 || data.battery_voltage > 20) return false;
  
  // Validar rangos físicos razonables del barómetro
  if (data.pressure < 500 || data.pressure > 1100) return false; // hPa (50kPa - 110kPa)
  if (data.temperature < -40 || data.temperature > 85) return false; // °C
  if (Math.abs(data.altitude) > 50000) return false; // 50km max
  if (Math.abs(data.velocity_z) > 500) return false; // 500 m/s max
  
  // Validar GPS
  if (Math.abs(data.gps_lat) > 90) return false;
  if (Math.abs(data.gps_lng) > 180) return false;
  if (Math.abs(data.gps_alt) > 50000) return false;
  if (data.gps_sats < 0 || data.gps_sats > 30) return false;
  
  // Validar IMU: Acelerómetro (±16G típico para cohetes)
  if (Math.abs(data.acc_x) > 16) return false;
  if (Math.abs(data.acc_y) > 16) return false;
  if (Math.abs(data.acc_z) > 16) return false;
  
  // Validar IMU: Giroscopio (±2000°/s típico)
  if (Math.abs(data.gyro_x) > 2000) return false;
  if (Math.abs(data.gyro_y) > 2000) return false;
  if (Math.abs(data.gyro_z) > 2000) return false;
  
  // Validar IMU: Magnetómetro (±200 µT típico)
  if (Math.abs(data.mag_x) > 200) return false;
  if (Math.abs(data.mag_y) > 200) return false;
  if (Math.abs(data.mag_z) > 200) return false;
  
  // Validar LoRa
  if (data.lora_rssi < -140 || data.lora_rssi > 0) return false; // dBm
  if (data.lora_snr < -20 || data.lora_snr > 20) return false; // dB
  
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

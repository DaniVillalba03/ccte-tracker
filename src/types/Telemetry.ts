/**
 * Datos de telemetría completos recibidos del cohete
 * Suite completa: IMU (9-DOF) + GPS + LoRa + Barómetro
 */
export interface TelemetryData {
  // ========== SISTEMA ==========
  /** ID único del paquete de telemetría */
  packet_id: number;
  
  /** Estado de la misión (0: Idle, 1: Armed, 2: Powered, 3: Coast, 4: Apogee, 5: Descent, 6: Landed) */
  mission_state: number;
  
  /** Tiempo de misión en segundos desde el lanzamiento */
  mission_time: number;
  
  /** Timestamp en milisegundos desde epoch */
  timestamp: number;
  
  // ========== ENERGÍA ==========
  /** Voltaje de batería en voltios */
  battery_voltage: number;
  
  // ========== BARÓMETRO (BMP280/BMP388) ==========
  /** Presión atmosférica en hPa */
  pressure: number;
  
  /** Temperatura del barómetro en °C */
  temperature: number;
  
  /** Altitud calculada del barómetro en metros MSL */
  altitude: number;
  
  /** Velocidad vertical calculada en m/s (derivada de altitud) */
  velocity_z: number;
  
  // ========== GPS (NEO-6M/7M) ==========
  /** Latitud GPS en grados decimales */
  gps_lat: number;
  
  /** Longitud GPS en grados decimales */
  gps_lng: number;
  
  /** Altitud GPS en metros MSL */
  gps_alt: number;
  
  /** Número de satélites GPS conectados */
  gps_sats: number;
  
  // ========== IMU: ACELERÓMETRO (MPU6050/BMI088) ==========
  /** Aceleración en eje X en G (1G = 9.81 m/s²) */
  acc_x: number;
  
  /** Aceleración en eje Y en G */
  acc_y: number;
  
  /** Aceleración en eje Z en G */
  acc_z: number;
  
  // ========== IMU: GIROSCOPIO (MPU6050/BMI088) ==========
  /** Velocidad angular en eje X en °/s */
  gyro_x: number;
  
  /** Velocidad angular en eje Y en °/s */
  gyro_y: number;
  
  /** Velocidad angular en eje Z en °/s */
  gyro_z: number;
  
  // ========== IMU: MAGNETÓMETRO (HMC5883L/QMC5883L) ==========
  /** Campo magnético en eje X en µT (microteslas) */
  mag_x: number;
  
  /** Campo magnético en eje Y en µT */
  mag_y: number;
  
  /** Campo magnético en eje Z en µT */
  mag_z: number;
  
  // ========== RADIO LoRa (RFM95W/SX1278) ==========
  /** Indicador de fuerza de señal recibida en dBm */
  lora_rssi: number;
  
  /** Relación señal-ruido en dB */
  lora_snr: number;
}

/**
 * Estados de la misión
 */
export enum MissionState {
  IDLE = 0,
  ARMED = 1,
  POWERED_FLIGHT = 2,
  COAST = 3,
  APOGEE = 4,
  DESCENT = 5,
  LANDED = 6,
  ERROR = 99
}

/**
 * Nombres legibles de estados de misión
 */
export const MISSION_STATE_NAMES: Record<number, string> = {
  0: 'En Espera',
  1: 'Armado',
  2: 'Ascenso Motorizado',
  3: 'Ascenso Balístico',
  4: 'Apogeo',
  5: 'Descenso',
  6: 'Aterrizado',
  99: 'Error'
};

/**
 * Definición de configuración de un sensor
 */
export interface SensorDefinition {
  /** Identificador único del sensor */
  id: string;
  
  /** Nombre legible para humanos */
  name: string;
  
  /** Unidad de medida */
  unit: string;
  
  /** Valor mínimo esperado */
  min: number;
  
  /** Valor máximo esperado */
  max: number;
  
  /** Tipo de widget para visualización */
  widgetType: 'gauge' | 'lineChart' | 'text' | 'status';
  
  /** Umbral de advertencia (opcional) */
  warningThreshold?: number;
  
  /** Color del widget (opcional) */
  color?: string;
}
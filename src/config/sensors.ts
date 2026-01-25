import { SensorDefinition } from '../types/Telemetry';

/**
 * Configuración completa de sensores del cohete
 * Suite: IMU (9-DOF) + GPS + LoRa + Barómetro + Sistema
 */
export const AVAILABLE_SENSORS: Record<string, SensorDefinition> = {
  // ========== SISTEMA ==========
  mission_state: {
    id: 'mission_state',
    name: 'Estado de Misión',
    unit: '',
    min: 0,
    max: 6,
    widgetType: 'status',
    color: '#00ff88'
  },
  
  packet_id: {
    id: 'packet_id',
    name: 'ID de Paquete',
    unit: '#',
    min: 0,
    max: 99999,
    widgetType: 'text',
    color: '#00ccff'
  },
  
  // ========== ENERGÍA ==========
  battery_voltage: {
    id: 'battery_voltage',
    name: 'Batería',
    unit: 'V',
    min: 10,
    max: 13,
    widgetType: 'gauge',
    warningThreshold: 11.0,
    color: '#ffaa00'
  },
  
  // ========== BARÓMETRO ==========
  altitude: {
    id: 'altitude',
    name: 'Altitud',
    unit: 'm',
    min: 0,
    max: 3000,
    widgetType: 'lineChart',
    color: '#00ff88'
  },
  
  velocity_z: {
    id: 'velocity_z',
    name: 'Velocidad Vertical',
    unit: 'm/s',
    min: -50,
    max: 150,
    widgetType: 'gauge',
    color: '#00ccff'
  },
  
  pressure: {
    id: 'pressure',
    name: 'Presión',
    unit: 'hPa',
    min: 800,
    max: 1050,
    widgetType: 'text',
    color: '#ffffff'
  },
  
  temperature: {
    id: 'temperature',
    name: 'Temperatura',
    unit: '°C',
    min: -20,
    max: 60,
    widgetType: 'text',
    color: '#ff6b6b'
  },
  
  // ========== GPS ==========
  gps_lat: {
    id: 'gps_lat',
    name: 'Latitud GPS',
    unit: '°',
    min: -90,
    max: 90,
    widgetType: 'text',
    color: '#00ff88'
  },
  
  gps_lng: {
    id: 'gps_lng',
    name: 'Longitud GPS',
    unit: '°',
    min: -180,
    max: 180,
    widgetType: 'text',
    color: '#00ccff'
  },
  
  gps_sats: {
    id: 'gps_sats',
    name: 'Satélites GPS',
    unit: 'sats',
    min: 0,
    max: 12,
    widgetType: 'text',
    warningThreshold: 4,
    color: '#ffd700'
  },
  
  gps_alt: {
    id: 'gps_alt',
    name: 'Altitud GPS',
    unit: 'm',
    min: 0,
    max: 3000,
    widgetType: 'text',
    color: '#00ccff'
  },
  
  // ========== IMU: ACELERÓMETRO ==========
  acc_z: {
    id: 'acc_z',
    name: 'Aceleración Vertical',
    unit: 'G',
    min: -2,
    max: 10,
    widgetType: 'lineChart',
    color: '#ff3366'
  },
  
  acc_x: {
    id: 'acc_x',
    name: 'Aceleración X',
    unit: 'G',
    min: -5,
    max: 5,
    widgetType: 'text',
    color: '#ff6b6b'
  },
  
  acc_y: {
    id: 'acc_y',
    name: 'Aceleración Y',
    unit: 'G',
    min: -5,
    max: 5,
    widgetType: 'text',
    color: '#4ecdc4'
  },
  
  // ========== IMU: GIROSCOPIO ==========
  gyro_x: {
    id: 'gyro_x',
    name: 'Giroscopio X',
    unit: '°/s',
    min: -500,
    max: 500,
    widgetType: 'text',
    color: '#95e1d3'
  },
  
  gyro_y: {
    id: 'gyro_y',
    name: 'Giroscopio Y',
    unit: '°/s',
    min: -500,
    max: 500,
    widgetType: 'text',
    color: '#f38181'
  },
  
  gyro_z: {
    id: 'gyro_z',
    name: 'Giroscopio Z',
    unit: '°/s',
    min: -500,
    max: 500,
    widgetType: 'text',
    color: '#aa96da'
  },
  
  // ========== IMU: MAGNETÓMETRO ==========
  mag_x: {
    id: 'mag_x',
    name: 'Magnetómetro X',
    unit: 'µT',
    min: -100,
    max: 100,
    widgetType: 'text',
    color: '#fcbad3'
  },
  
  mag_y: {
    id: 'mag_y',
    name: 'Magnetómetro Y',
    unit: 'µT',
    min: -100,
    max: 100,
    widgetType: 'text',
    color: '#ffffd2'
  },
  
  mag_z: {
    id: 'mag_z',
    name: 'Magnetómetro Z',
    unit: 'µT',
    min: -100,
    max: 100,
    widgetType: 'text',
    color: '#a8d8ea'
  },
  
  // ========== LoRa ==========
  lora_rssi: {
    id: 'lora_rssi',
    name: 'Señal LoRa (RSSI)',
    unit: 'dBm',
    min: -120,
    max: -40,
    widgetType: 'lineChart',
    warningThreshold: -110,
    color: '#ff9ff3'
  },
  
  lora_snr: {
    id: 'lora_snr',
    name: 'LoRa SNR',
    unit: 'dB',
    min: -10,
    max: 15,
    widgetType: 'text',
    color: '#feca57'
  },
};

/**
 * Layout optimizado del dashboard para telemetría completa
 * Grid de 12 columnas × N filas
 */
export const DEFAULT_LAYOUT = [
  // Fila 1: Estado + Altitud + Velocidad
  { i: 'mission_state', x: 0, y: 0, w: 2, h: 2 },
  { i: 'altitude', x: 2, y: 0, w: 6, h: 4 },
  { i: 'velocity_z', x: 8, y: 0, w: 4, h: 4 },
  
  // Fila 2: Aceleración Z + Batería + GPS
  { i: 'acc_z', x: 2, y: 4, w: 6, h: 4 },
  { i: 'battery_voltage', x: 8, y: 4, w: 2, h: 4 },
  { i: 'gps_sats', x: 10, y: 4, w: 2, h: 2 },
  { i: 'packet_id', x: 0, y: 2, w: 2, h: 2 },
  
  // Fila 3: Coordenadas GPS
  { i: 'gps_lat', x: 0, y: 4, w: 2, h: 2 },
  { i: 'gps_lng', x: 0, y: 6, w: 2, h: 2 },
  
  // Fila 4: IMU Giroscopio
  { i: 'gyro_x', x: 0, y: 8, w: 2, h: 2 },
  { i: 'gyro_y', x: 2, y: 8, w: 2, h: 2 },
  { i: 'gyro_z', x: 4, y: 8, w: 2, h: 2 },
  
  // Fila 5: IMU Magnetómetro + LoRa
  { i: 'mag_x', x: 0, y: 10, w: 2, h: 2 },
  { i: 'mag_y', x: 2, y: 10, w: 2, h: 2 },
  { i: 'mag_z', x: 4, y: 10, w: 2, h: 2 },
  { i: 'lora_rssi', x: 6, y: 8, w: 4, h: 4 },
  { i: 'lora_snr', x: 10, y: 8, w: 2, h: 2 },
  
  // Fila 6: Ambiente + IMU Acelerómetro
  { i: 'temperature', x: 10, y: 10, w: 2, h: 2 },
  { i: 'pressure', x: 10, y: 6, w: 2, h: 2 },
  { i: 'gps_alt', x: 6, y: 12, w: 2, h: 2 },
  { i: 'acc_x', x: 0, y: 12, w: 2, h: 2 },
  { i: 'acc_y', x: 2, y: 12, w: 2, h: 2 },
];

/**
 * Grupos de sensores por categoría (para organización en UI)
 */
export const SENSOR_GROUPS = {
  sistema: ['mission_state', 'packet_id'],
  energia: ['lat', 'gps_lng', 'gps_battery_voltage'],
  barometro: ['altitude', 'velocity_z', 'pressure', 'temperature'],
  gps: ['gps_sats', 'gps_alt'],
  acelerometro: ['acc_x', 'acc_y', 'acc_z'],
  giroscopio: ['gyro_x', 'gyro_y', 'gyro_z'],
  magnetometro: ['mag_x', 'mag_y', 'mag_z'],
  lora: ['lora_rssi', 'lora_snr'],
};

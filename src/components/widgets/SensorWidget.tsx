import { useMemo, useRef, useEffect } from 'react';
import { TelemetryData, SensorDefinition } from '../../types/Telemetry';
import { AVAILABLE_SENSORS } from '../../config/sensors';
import { formatMissionState } from '../../utils/dataParsing';
import { AttitudeIndicator } from './AttitudeIndicator';
import { Line } from 'react-chartjs-2';
import { PauseCircle, Zap, Rocket, Target, ArrowUpCircle, CloudRain, CheckCircle, XCircle, HelpCircle, AlertTriangle } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import './SensorWidget.css';

// Registrar componentes de Chart.js globalmente
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SensorWidgetProps {
  sensorId: string;
  data: TelemetryData | null;
}

const MAX_HISTORY_POINTS = 100;

export function SensorWidget({ sensorId, data }: SensorWidgetProps) {
  const config: SensorDefinition | undefined = AVAILABLE_SENSORS[sensorId];
  const historyRef = useRef<{ time: number; value: number }[]>([]);

  // Obtener valor actual del sensor
  const currentValue = useMemo(() => {
    if (!data || !config) return 0;
    
    const value = data[sensorId as keyof TelemetryData];
    
    if (typeof value === 'number') {
      return value;
    }
    
    return 0;
  }, [data, config, sensorId]);

  // Verificar si está en estado de advertencia
  const isWarning = useMemo(() => {
    if (!config?.warningThreshold) return false;
    
    // Para RSSI (valores negativos), warning si es MENOR que threshold
    if (sensorId === 'lora_rssi') {
      return currentValue < config.warningThreshold;
    }
    
    // Para otros sensores, warning si es MENOR que threshold
    return currentValue < config.warningThreshold;
  }, [currentValue, config, sensorId]);

  // Actualizar historial para gráficos
  useEffect(() => {
    if (data && config?.widgetType === 'lineChart') {
      historyRef.current.push({
        time: data.timestamp,
        value: currentValue,
      });

      if (historyRef.current.length > MAX_HISTORY_POINTS) {
        historyRef.current.shift();
      }
    }
  }, [data, currentValue, config]);

  if (!config) {
    return (
      <div className="widget-container widget-error">
        <p>Sensor no configurado: {sensorId}</p>
      </div>
    );
  }

  // Renderizar según tipo de widget
  switch (config.widgetType) {
    case 'lineChart':
      return (
        <div className="widget-container widget-chart">
          <div className="widget-header">
            <h3>{config.name}</h3>
            <span className="widget-value">
              {currentValue.toFixed(1)} {config.unit}
            </span>
          </div>
          <div className="widget-body">
            <Line
              data={{
                labels: historyRef.current.map((_, i) => i.toString()),
                datasets: [
                  {
                    label: config.name,
                    data: historyRef.current.map((p) => p.value),
                    borderColor: config.color || '#00ff88',
                    backgroundColor: `${config.color || '#00ff88'}20`,
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    fill: true,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: {
                    min: config.min,
                    max: config.max,
                    grid: {
                      color: 'rgba(255, 255, 255, 0.1)',
                    },
                    ticks: {
                      color: config.color || '#00ff88',
                    },
                  },
                  x: {
                    display: false,
                  },
                },
                plugins: {
                  legend: {
                    display: false,
                  },
                  tooltip: {
                    enabled: false,
                  },
                },
                animation: false,
              }}
            />
          </div>
        </div>
      );

    case 'gauge': {
      const percentage = Math.min(100, Math.max(0, ((currentValue - config.min) / (config.max - config.min)) * 100));
      return (
        <div className={`widget-container widget-gauge ${isWarning ? 'warning' : ''}`}>
          <div className="widget-header">
            <h3>{config.name}</h3>
          </div>
          <div className="widget-body">
            <div className="gauge-circle">
              <svg viewBox="0 0 200 200" className="gauge-svg">
                <circle
                  cx="100"
                  cy="100"
                  r="80"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="20"
                />
                {currentValue !== 0 && (
                  <circle
                    cx="100"
                    cy="100"
                    r="80"
                    fill="none"
                    stroke={isWarning ? '#ff3366' : (config.color || '#00ff88')}
                    strokeWidth="20"
                    strokeDasharray={`${(percentage / 100) * 502.4} 502.4`}
                    strokeLinecap="round"
                    transform="rotate(-90 100 100)"
                    className="gauge-progress"
                  />
                )}
              </svg>
              <div className="gauge-value">
                <span className="gauge-number">{currentValue.toFixed(1)}</span>
                <span className="gauge-unit">{config.unit}</span>
              </div>
            </div>
            <div className="gauge-range">
              <span>{config.min}</span>
              <span>{config.max}</span>
            </div>
          </div>
        </div>
      );
    }

    case 'status':
      return (
        <div className={`widget-container widget-status ${getStatusClass(currentValue)}`}>
          <div className="widget-header">
            <h3>{config.name}</h3>
          </div>
          <div className="widget-body">
            <div className="status-display">
              <div className="status-badge">
                <span className="status-icon">{getStatusIcon(currentValue)}</span>
                <span className="status-text">{formatMissionState(currentValue)}</span>
              </div>
            </div>
          </div>
        </div>
      );

    case 'text':
      return (
        <div className={`widget-container widget-digital ${isWarning ? 'warning' : ''}`}>
          <div className="widget-header">
            <h3>{config.name}</h3>
          </div>
          <div className="widget-body">
            <div className="digital-display">
              <span className="digital-value" style={{ color: config.color }}>
                {currentValue.toFixed(2)}
              </span>
              <span className="digital-unit">{config.unit}</span>
            </div>
            {isWarning && (
              <div className="warning-indicator flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {sensorId === 'gps_sats' ? 'Señal débil' : 'Valor bajo'}
              </div>
            )}
          </div>
        </div>
      );

    case 'attitude':
      return (
        <div className="widget-container widget-attitude">
          <AttitudeIndicator data={data} />
        </div>
      );

    default:
      return (
        <div className="widget-container">
          <p>Tipo de widget no soportado</p>
        </div>
      );
  }
}

// Helper functions
function getStatusClass(state: number): string {
  switch (state) {
    case 0: return 'status-idle';
    case 1: return 'status-armed';
    case 2: return 'status-powered';
    case 3: return 'status-coast';
    case 4: return 'status-apogee';
    case 5: return 'status-descent';
    case 6: return 'status-landed';
    case 99: return 'status-error';
    default: return 'status-unknown';
  }
}

function getStatusIcon(state: number): React.ReactElement {
  const iconClass = "w-6 h-6";
  switch (state) {
    case 0: return <PauseCircle className={iconClass} />;
    case 1: return <Zap className={iconClass} />;
    case 2: return <Rocket className={iconClass} />;
    case 3: return <Target className={iconClass} />;
    case 4: return <ArrowUpCircle className={iconClass} />;
    case 5: return <CloudRain className={iconClass} />;
    case 6: return <CheckCircle className={iconClass} />;
    case 99: return <XCircle className={iconClass} />;
    default: return <HelpCircle className={iconClass} />;
  }
}

import { useState, useEffect, useRef } from 'react';
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import { SensorWidget } from '../widgets/SensorWidget';
import { AVAILABLE_SENSORS, DEFAULT_LAYOUT } from '../../config/sensors';
import { TelemetryData } from '../../types/Telemetry';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './Dashboard.css';

interface DashboardProps {
  telemetryData: TelemetryData | null;
}

export function Dashboard({ telemetryData }: DashboardProps) {

  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [width, setWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cargar layout guardado al montar
  useEffect(() => {
    const savedLayout = localStorage.getItem('dashboard-layout');
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout);
        setLayout(parsed);
      } catch (err) {
        console.error('Error loading saved layout:', err);
      }
    }
  }, []);

  // Manejar resize del contenedor usando ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) {
          setWidth(newWidth);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleLayoutChange = (_layout: any, layouts: any) => {
    // Guardar solo el layout de 'lg' (principal)
    if (layouts.lg) {
      setLayout(layouts.lg);
      localStorage.setItem('dashboard-layout', JSON.stringify(layouts.lg));
    }
  };

  return (
    <div className="dashboard-container">
      {/* Grid de Widgets */}
      <div 
        ref={containerRef} 
        className="dashboard-content" 
        style={{ width: '100%' }}
      >
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: layout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={80}
          width={width}
          onLayoutChange={handleLayoutChange}
        >
          {Object.keys(AVAILABLE_SENSORS).map((sensorId) => (
            <div key={sensorId} className="grid-item">
              <SensorWidget 
                sensorId={sensorId} 
                data={telemetryData}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>
    </div>
  );
}

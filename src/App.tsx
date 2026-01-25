import { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { TrackingMap } from './components/map/TrackingMap';
import { Scene3D } from './components/3d/Scene3D';
import { useSerial } from './hooks/useSerial';
import { useTrajectory } from './hooks/useTrajectory';
import { generateFakeTelemetry, resetSimulation } from './utils/simulation';
import { TelemetryData } from './types/Telemetry';
import { Rocket, Wifi, WifiOff, Usb, Map, Box, Terminal, ChevronRight, ChevronLeft, AlertTriangle, Play, Pause, Trash2 } from 'lucide-react';
import './App.css';

type TabView = '3d' | 'map' | 'raw';

function App() {
  const { 
    latestDataRef, 
    isConnected, 
    connect, 
    disconnect, 
    error, 
    stats, 
    currentBaudRate 
  } = useSerial();

  // CRÍTICO: Estado de React para forzar re-renders
  const [telemetryData, setTelemetryData] = useState<TelemetryData | null>(null);

  const { currentPos, trajectory, clearTrajectory } = useTrajectory(telemetryData);
  
  const [activeTab, setActiveTab] = useState<TabView>('map');
  const [selectedBaudRate, setSelectedBaudRate] = useState(115200);
  const [showSidebar, setShowSidebar] = useState(true);
  
  // ===== MODO SIMULACIÓN =====
  const [isSimulating, setIsSimulating] = useState(false);
  const simulationStartTimeRef = useRef<number>(0);
  const dbWorkerRef = useRef<Worker | null>(null);

  // Inicializar Worker para simulación
  useEffect(() => {
    dbWorkerRef.current = new Worker(
      new URL('./workers/dbWorker.ts', import.meta.url),
      { type: 'module' }
    );

    dbWorkerRef.current.onmessage = (event) => {
      const { type, error: workerError } = event.data;
      
      if (type === 'ERROR') {
        console.error('DB Worker Error:', workerError);
      } else if (type === 'BATCH_SAVED') {
        console.log('Batch guardado en IndexedDB');
      }
    };

    return () => {
      dbWorkerRef.current?.terminate();
    };
  }, []);

  // ===== MODO SIMULACIÓN: Generar datos falsos =====
  useEffect(() => {
    if (!isSimulating) return;

    // Iniciar timer
    simulationStartTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - simulationStartTimeRef.current) / 1000;
      
      // Generar datos de telemetría falsos
      const fakeData = generateFakeTelemetry(elapsedSeconds);
      
      // CRÍTICO: Actualizar estado de React para forzar re-render
      setTelemetryData(fakeData);
      
      // Actualizar referencia para UI
      latestDataRef.current = fakeData;
      
      // Enviar al Worker para persistencia
      dbWorkerRef.current?.postMessage({
        type: 'SAVE_CHUNK',
        payload: fakeData
      });

      // Detener simulación después de 3 minutos
      if (elapsedSeconds > 180) {
        setIsSimulating(false);
      }
    }, 100); // 10Hz (100ms)

    return () => {
      clearInterval(interval);
      // Flush final al detener
      dbWorkerRef.current?.postMessage({ type: 'FLUSH' });
    };
  }, [isSimulating, latestDataRef]);

  // ===== MODO SERIAL: Sincronizar datos desde useSerial =====
  useEffect(() => {
    if (!isConnected || isSimulating) return;

    // Usar requestAnimationFrame para mantener UI fluida (60 FPS)
    let animationFrameId: number;

    const syncSerialData = () => {
      if (latestDataRef.current) {
        // Actualizar estado de React con los datos del serial
        setTelemetryData(latestDataRef.current);
      }
      
      // Continuar el loop
      animationFrameId = requestAnimationFrame(syncSerialData);
    };

    // Iniciar el loop
    animationFrameId = requestAnimationFrame(syncSerialData);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isConnected, isSimulating, latestDataRef]);

  const handleConnect = async () => {
    await connect(selectedBaudRate);
  };

  const toggleSimulation = () => {
    if (isConnected) {
      alert('Desconecta el puerto serial antes de iniciar la simulación');
      return;
    }
    
    // Si estamos iniciando la simulación (no estaba simulando antes)
    if (!isSimulating) {
      // Resetear el estado de la simulación
      resetSimulation();
      // Limpiar la trayectoria anterior
      clearTrajectory();
      // Resetear la telemetría
      setTelemetryData(null);
    }
    
    setIsSimulating(!isSimulating);
  };

  /**
   * Purgar completamente la base de datos IndexedDB
   * ADVERTENCIA: Esta acción no se puede deshacer
   */
  const handleClearDatabase = async () => {
    // Prevenir purga durante conexión activa o simulación
    if (isConnected || isSimulating) {
      alert('⚠️ OPERACIÓN BLOQUEADA\n\nDebes desconectar el puerto serial o detener la simulación antes de purgar la base de datos.');
      return;
    }

    // Confirmación doble para evitar borrado accidental
    const confirmed = window.confirm(
      '⚠️ ¿ESTÁS SEGURO?\n\n' +
      'Esta acción borrará:\n' +
      '• Todo el historial de vuelo guardado\n' +
      '• Todas las misiones anteriores\n' +
      '• Los datos de telemetría almacenados\n\n' +
      'La página se recargará automáticamente.\n\n' +
      '⚠️ ESTA ACCIÓN NO SE PUEDE DESHACER ⚠️'
    );

    if (!confirmed) return;

    try {
      console.log('🗑️ Iniciando purga de base de datos...');
      
      // Borrar la base de datos IndexedDB
      const deleteRequest = indexedDB.deleteDatabase('RocketMissionDB');
      
      deleteRequest.onsuccess = () => {
        console.log('✅ Base de datos borrada exitosamente');
        
        // Mostrar notificación
        alert('✅ Base de datos purgada correctamente.\n\nLa página se recargará para limpiar la memoria.');
        
        // Recargar la página para limpiar toda la memoria RAM
        window.location.reload();
      };

      deleteRequest.onerror = (event) => {
        console.error('❌ Error al borrar la base de datos:', event);
        alert('❌ Error al purgar la base de datos.\n\nIntenta cerrar todas las pestañas de esta aplicación y vuelve a intentarlo.');
      };

      deleteRequest.onblocked = () => {
        console.warn('⚠️ La base de datos está bloqueada por otra pestaña');
        alert('⚠️ La base de datos está siendo usada por otra pestaña.\n\nCierra todas las pestañas de esta aplicación y vuelve a intentarlo.');
      };

    } catch (error) {
      console.error('❌ Error inesperado al purgar:', error);
      alert('❌ Error inesperado al purgar la base de datos.');
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'map':
        return (
          <div className="tab-content">
            <TrackingMap 
              currentPos={currentPos}
              trajectory={trajectory}
              height="100%"
              zoom={15}
            />
          </div>
        );

      case '3d':
        return (
          <div className="tab-content tab-3d">
            <Scene3D data={telemetryData} />
          </div>
        );

      case 'raw':
        return (
          <div className="tab-content tab-terminal">
            <div className="terminal-header">
              <span className="terminal-title flex items-center gap-2"><Terminal className="w-4 h-4" /> Terminal de Datos Crudos</span>
            </div>
            <div className="terminal-body">
              {telemetryData ? (
                <pre className="terminal-output">
                  {JSON.stringify(telemetryData, null, 2)}
                </pre>
              ) : (
                <div className="terminal-placeholder">
                  Esperando datos...
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      {/* Header Global */}
      <header className="app-header">
        <div className="header-brand">
          <img 
            src="/logo.png" 
            alt="CCTE Logo" 
            className="brand-logo-image"
          />
          <div className="brand-info">
            <h1 className="brand-title">CCTE TRACKER</h1>
            <p className="brand-subtitle">Ground Station · Offline First</p>
          </div>
        </div>

        <div className="header-status">
          <div className="status-indicator-group">
            {isConnected ? (
              <Wifi className="w-5 h-5 text-green-500" />
            ) : isSimulating ? (
              <Play className="w-5 h-5 text-orange-500 animate-pulse" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500" />
            )}
            <span className="status-text">
              {isConnected ? 'CONECTADO' : isSimulating ? 'SIMULANDO' : 'DESCONECTADO'}
            </span>
            {currentBaudRate && (
              <span className="status-baud">@ {currentBaudRate} baud</span>
            )}
            {isSimulating && (
              <span className="status-simulation">
                {((Date.now() - simulationStartTimeRef.current) / 1000).toFixed(0)}s
              </span>
            )}
          </div>

          {(isConnected || isSimulating) && (
            <div className="header-stats">
              <div className="stat-badge">
                <span className="stat-label">PKT</span>
                <span className="stat-value">
                  {telemetryData?.packet_id ?? stats.packetsReceived}
                </span>
              </div>
              <div className="stat-badge">
                <span className="stat-label">ALT</span>
                <span className="stat-value">
                  {telemetryData?.altitude.toFixed(0) ?? 0}m
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="header-controls">
          {!isConnected && !isSimulating ? (
            <div className="connection-controls">
              <select
                className="baud-select"
                value={selectedBaudRate}
                onChange={(e) => setSelectedBaudRate(Number(e.target.value))}
              >
                <option value={9600}>9600</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
                <option value={57600}>57600</option>
                <option value={115200}>115200</option>
                <option value={230400}>230400</option>
              </select>
              <button className="btn-connect flex items-center gap-2" onClick={handleConnect}>
                <Usb className="w-4 h-4" /> CONECTAR
              </button>
              <button 
                className="btn-simulate flex items-center gap-2" 
                onClick={toggleSimulation}
              >
                <Play className="w-4 h-4" /> MODO DEMO
              </button>
              <button 
                className="btn-purge flex items-center gap-2" 
                onClick={handleClearDatabase}
                title="Purgar base de datos (ELIMINA TODO EL HISTORIAL)"
              >
                <Trash2 className="w-4 h-4" /> PURGAR DB
              </button>
            </div>
          ) : isConnected ? (
            <button className="btn-disconnect flex items-center gap-2" onClick={disconnect}>
              <WifiOff className="w-4 h-4" /> DESCONECTAR
            </button>
          ) : (
            <button 
              className="btn-stop-simulate flex items-center gap-2" 
              onClick={toggleSimulation}
            >
              <Pause className="w-4 h-4" /> DETENER DEMO
            </button>
          )}

          <button 
            className="btn-sidebar-toggle"
            onClick={() => setShowSidebar(!showSidebar)}
            title={showSidebar ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
          >
            {showSidebar ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <AlertTriangle className="w-5 h-5 text-warning" />
          <span className="error-message">{error}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="app-body">
        {/* Left Column: Dashboard with Widgets */}
        <div className="main-panel">
          <Dashboard telemetryData={telemetryData} />
        </div>

        {/* Right Column: Tabs (3D, Map, Raw Data) */}
        {showSidebar && (
          <aside className="side-panel">
            <div className="side-panel-header">
              <div className="tab-nav">
                <button
                  className={`tab-button ${activeTab === 'map' ? 'active' : ''}`}
                  onClick={() => setActiveTab('map')}
                >
                  <Map className="w-4 h-4 mr-2" /> Mapa
                </button>
                <button
                  className={`tab-button ${activeTab === '3d' ? 'active' : ''}`}
                  onClick={() => setActiveTab('3d')}
                >
                  <Box className="w-4 h-4 mr-2" /> 3D
                </button>
                <button
                  className={`tab-button ${activeTab === 'raw' ? 'active' : ''}`}
                  onClick={() => setActiveTab('raw')}
                >
                  <Terminal className="w-4 h-4 mr-2" /> RAW
                </button>
              </div>
            </div>

            <div className="side-panel-body">
              {renderTabContent()}
            </div>
          </aside>
        )}
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-info">
          <span>CCTE © 2024</span>
          <span className="separator">•</span>
          <span>Arquitectura Offline-First</span>
          {(isConnected || isSimulating) && telemetryData && (
            <>
              <span className="separator">•</span>
              <span>
                T+{telemetryData.mission_time.toFixed(1)}s · 
                ALT: {telemetryData.altitude.toFixed(0)}m · 
                VEL: {telemetryData.velocity_z.toFixed(1)}m/s
              </span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;

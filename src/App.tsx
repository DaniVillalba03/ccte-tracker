import { useState, useEffect, useRef } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { TrackingMap } from './components/map/TrackingMap';
import { Scene3D } from './components/3d/Scene3D';
import { DualLinkPanel } from './components/widgets/DualLinkPanel';
import { useSerial } from './hooks/useSerial';
import { useTrajectory } from './hooks/useTrajectory';
import { generateFakeTelemetry, resetSimulation, getMotorInterval } from './utils/simulation';
import { exportTelemetryToCSV, getDatabaseStats } from './services/exportService';
import { TelemetryData } from './types/Telemetry';
import { Wifi, WifiOff, Usb, Map, Box, Terminal, ChevronRight, ChevronLeft, AlertTriangle, Play, Pause, Trash2, Download } from 'lucide-react';
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
    currentBaudRate,
    isHighSpeedActive,
    isLoraActive
  } = useSerial();

  // CRÍTICO: Solo guardamos el ÚLTIMO dato (no historial)
  // React NO debe guardar el historial completo (consume GB de RAM)
  // El historial se guarda en IndexedDB mediante fire-and-forget
  const [telemetryData, setTelemetryData] = useState<TelemetryData | null>(null);
  
  // NUEVO: Timestamp del último update de UI (Throttle)
  const lastUIUpdateRef = useRef<number>(0);
  const UI_UPDATE_INTERVAL = 100; // 100ms = 10 Hz

  const { currentPos, trajectory, clearTrajectory } = useTrajectory(telemetryData);
  
  const [activeTab, setActiveTab] = useState<TabView>('map');
  const [selectedBaudRate, setSelectedBaudRate] = useState(500000);
  const [showSidebar, setShowSidebar] = useState(true);
  
  // ===== MODO SIMULACIÓN =====
  const [isSimulating, setIsSimulating] = useState(false);
  const simulationStartTimeRef = useRef<number>(0);
  const dbWorkerRef = useRef<Worker | null>(null);
  
  // NUEVO: Estados simulados de heartbeat independientes
  const [simHighSpeedActive, setSimHighSpeedActive] = useState(false);
  const [simLoraActive, setSimLoraActive] = useState(false);
  
  // NUEVO: Estadísticas de packets guardados
  const [totalPacketsSaved, setTotalPacketsSaved] = useState(0);

  // Inicializar Worker para simulación
  useEffect(() => {
    dbWorkerRef.current = new Worker(
      new URL('./workers/dbWorker.ts', import.meta.url),
      { type: 'module' }
    );

    dbWorkerRef.current.onmessage = (event) => {
      const { type, count, totalSaved, error: workerError } = event.data;
      
      if (type === 'ERROR') {
        console.error('DB Worker Error:', workerError);
      } else if (type === 'BATCH_SAVED') {
        console.log(`Batch guardado: ${count} paquetes (Total: ${totalSaved})`);
        setTotalPacketsSaved(totalSaved);
      } else if (type === 'FLUSH_COMPLETE') {
        console.log(`Flush completo: ${count} paquetes (Total: ${totalSaved})`);
        setTotalPacketsSaved(totalSaved);
      }
    };

    return () => {
      dbWorkerRef.current?.terminate();
    };
  }, []);

  // ===== MODO SIMULACIÓN A 400Hz =====
  useEffect(() => {
    if (!isSimulating) return;

    simulationStartTimeRef.current = Date.now();
    
    // MOTOR DE 400Hz: Genera datos cada 2.5ms
    const motorInterval = getMotorInterval(); // 2.5ms
    
    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - simulationStartTimeRef.current) / 1000;
      
      // SIMULACIÓN DE PÉRDIDA DE SEÑAL DINÁMICA
      // Segundos 0-5: Ambos activos
      // Segundos 5-10: Solo LoRa (High-Speed pierde señal)
      // Segundos 10-15: Ambos activos de nuevo
      // Segundos 15-20: Solo High-Speed (LoRa pierde señal)
      // Repite cada 20 segundos
      
      const phase = Math.floor(elapsedSeconds) % 20;
      
      if (phase < 5) {
        // Fase 1: Ambos activos
        setSimHighSpeedActive(true);
        setSimLoraActive(true);
      } else if (phase < 10) {
        // Fase 2: Solo LoRa
        setSimHighSpeedActive(false);
        setSimLoraActive(true);
      } else if (phase < 15) {
        // Fase 3: Ambos activos
        setSimHighSpeedActive(true);
        setSimLoraActive(true);
      } else {
        // Fase 4: Solo High-Speed
        setSimHighSpeedActive(true);
        setSimLoraActive(false);
      }
      
      // Generar paquete de telemetría a 400Hz
      const { data, needsUIUpdate } = generateFakeTelemetry(elapsedSeconds);
      
      // CRÍTICO: Guardar SIEMPRE en DB (400Hz)
      dbWorkerRef.current?.postMessage({
        type: 'SAVE_CHUNK',
        payload: data
      });
      
      // THROTTLE: Actualizar UI solo si han pasado 100ms (10Hz)
      if (needsUIUpdate) {
        setTelemetryData(data);
        latestDataRef.current = data;
      }

      // Detener simulación después de 3 minutos
      if (elapsedSeconds > 180) {
        setIsSimulating(false);
      }
    }, motorInterval); // 2.5ms = 400Hz

    return () => {
      clearInterval(interval);
      dbWorkerRef.current?.postMessage({ type: 'FLUSH' });
    };
  }, [isSimulating, latestDataRef]);

  // ===== MODO SERIAL: Sincronizar datos desde useSerial con THROTTLE =====
  useEffect(() => {
    if (!isConnected || isSimulating) return;

    let animationFrameId: number;

    const syncSerialData = () => {
      const now = Date.now();
      
      // THROTTLE: Solo actualizar UI cada 100ms (10 Hz)
      if (now - lastUIUpdateRef.current >= UI_UPDATE_INTERVAL) {
        if (latestDataRef.current) {
          setTelemetryData(latestDataRef.current);
          lastUIUpdateRef.current = now;
        }
      }
      
      // Continuar loop a 60 FPS (para mantener fluidez)
      animationFrameId = requestAnimationFrame(syncSerialData);
    };

    animationFrameId = requestAnimationFrame(syncSerialData);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isConnected, isSimulating, latestDataRef]);

  const handleConnect = async () => {
    await connect(selectedBaudRate);
    // Resetear contador al conectar
    dbWorkerRef.current?.postMessage({ type: 'RESET_STATS' });
    setTotalPacketsSaved(0);
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
      // Resetear contador
      dbWorkerRef.current?.postMessage({ type: 'RESET_STATS' });
      setTotalPacketsSaved(0);
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
      alert('OPERACIÓN BLOQUEADA\n\nDebes desconectar el puerto serial o detener la simulación antes de purgar la base de datos.');
      return;
    }

    // Obtener estadísticas antes de borrar (sin cargar datos en RAM)
    try {
      const stats = await getDatabaseStats();
      
      if (stats.totalRecords === 0) {
        alert('La base de datos ya está vacía.\n\nNo hay datos para purgar.');
        return;
      }
      
      // Confirmación doble para evitar borrado accidental
      const confirmed = window.confirm(
        '¿ESTÁS SEGURO?\n\n' +
        'Esta acción borrará:\n' +
        `• ${stats.totalRecords.toLocaleString()} paquetes guardados\n` +
        `• ${stats.estimatedSizeMB.toFixed(2)} MB de datos\n` +
        '• Todo el historial de vuelo\n\n' +
        'ESTA ACCIÓN NO SE PUEDE DESHACER'
      );

      if (!confirmed) return;

      console.log('Iniciando purga de base de datos...');
      
      // Borrar la base de datos IndexedDB
      const deleteRequest = indexedDB.deleteDatabase('RocketMissionDB');
      
      deleteRequest.onsuccess = () => {
        console.log('Base de datos borrada exitosamente');
        alert('Base de datos purgada correctamente.\n\nLa página se recargará.');
        window.location.reload();
      };

      deleteRequest.onerror = (event) => {
        console.error('Error al borrar la base de datos:', event);
        alert('Error al purgar la base de datos.\n\nIntenta cerrar otras pestañas de la aplicación.');
      };

      deleteRequest.onblocked = () => {
        console.warn('La base de datos está bloqueada por otra pestaña');
        alert('La base de datos está siendo usada por otra pestaña.\n\nCierra todas las pestañas de esta aplicación.');
      };

    } catch (error) {
      console.error('Error inesperado al purgar:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      alert(`Error al purgar la base de datos:\n\n${errorMessage}`);
    }
  };

  // OPTIMIZADO: Exportar datos con chunked reading (no consume RAM)
  // Lee de 5,000 en 5,000 registros para evitar explosión de memoria
  const handleExportData = async () => {
    try {
      // Obtener estadísticas antes de exportar (sin cargar datos en RAM)
      const stats = await getDatabaseStats();
      
      if (stats.totalRecords === 0) {
        alert('No hay datos para exportar.\n\nInicia una simulación primero haciendo clic en "MODO DEMO".');
        return;
      }
      
      const confirmed = window.confirm(
        `Exportar ${stats.totalRecords.toLocaleString()} registros a CSV?\n\n` +
        `Tamaño estimado: ${stats.estimatedSizeMB.toFixed(2)} MB\n` +
        `Esto puede tomar unos segundos.`
      );
      
      if (!confirmed) return;
      
      // Exportar usando chunked reading (optimizado para RAM)
      await exportTelemetryToCSV();
      
      alert(`Exportación completa!\n\n${stats.totalRecords.toLocaleString()} paquetes exportados.`);
      
    } catch (error) {
      console.error('Error al exportar:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      alert(`Error al exportar datos:\n\n${errorMessage}\n\nRevisa la consola para más detalles.`);
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
              <span className="text-xs text-gray-400">
                Mostrando último paquete (actualización cada 100ms)
              </span>
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
            <p className="brand-subtitle">Ground Station · Dual Link</p>
          </div>
        </div>

        <div className="header-status">
          {/* NUEVO: Panel de Monitoreo Dual de Enlaces */}
          <DualLinkPanel 
            isHighSpeedActive={isSimulating ? simHighSpeedActive : isHighSpeedActive}
            isLoraActive={isSimulating ? simLoraActive : isLoraActive}
            isSystemActive={isConnected || isSimulating}
          />

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
                <span className="stat-label">PKT RX</span>
                <span className="stat-value">
                  {telemetryData?.packet_id ?? stats.packetsReceived}
                </span>
              </div>
              <div className="stat-badge">
                <span className="stat-label">PKT DB</span>
                <span className="stat-value">
                  {totalPacketsSaved}
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
                <option value={500000}>500000</option>
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
                className="btn-export flex items-center gap-2" 
                onClick={handleExportData}
                title="Exportar datos completos a CSV"
              >
                <Download className="w-4 h-4" /> EXPORTAR
              </button>
              <button 
                className="btn-purge flex items-center gap-2" 
                onClick={handleClearDatabase}
                title="Purgar base de datos"
              >
                <Trash2 className="w-4 h-4" /> PURGAR DB
              </button>
            </div>
          ) : isConnected ? (
            <>
              <button 
                className="btn-export flex items-center gap-2" 
                onClick={handleExportData}
              >
                <Download className="w-4 h-4" /> EXPORTAR
              </button>
              <button className="btn-disconnect flex items-center gap-2" onClick={disconnect}>
                <WifiOff className="w-4 h-4" /> DESCONECTAR
              </button>
            </>
          ) : (
            <>
              <button 
                className="btn-export flex items-center gap-2" 
                onClick={handleExportData}
              >
                <Download className="w-4 h-4" /> EXPORTAR
              </button>
              <button 
                className="btn-stop-simulate flex items-center gap-2" 
                onClick={toggleSimulation}
              >
                <Pause className="w-4 h-4" /> DETENER DEMO
              </button>
            </>
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
                VEL: {telemetryData.velocity_z.toFixed(1)}m/s · 
                DB: {totalPacketsSaved} pkts
              </span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;

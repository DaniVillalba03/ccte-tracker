interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleTrajectory: () => void;
  showTrajectory: boolean;
}

/**
 * Controles adicionales para el mapa
 */
export function MapControls({
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleTrajectory,
  showTrajectory,
}: MapControlsProps) {
  return (
    <div className="map-controls">
      <button 
        className="map-control-btn" 
        onClick={onZoomIn}
        title="Acercar"
      >
        +
      </button>
      <button 
        className="map-control-btn" 
        onClick={onZoomOut}
        title="Alejar"
      >
        −
      </button>
      <button 
        className="map-control-btn" 
        onClick={onResetView}
        title="Recentrar"
      >
        🎯
      </button>
      <button 
        className={`map-control-btn ${showTrajectory ? 'active' : ''}`}
        onClick={onToggleTrajectory}
        title="Mostrar/Ocultar Trayectoria"
      >
        📍
      </button>
    </div>
  );
}

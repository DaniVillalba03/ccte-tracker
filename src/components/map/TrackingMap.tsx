import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Crosshair, Navigation } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './TrackingMap.css';

// Ícono de cohete usando lucide-react Rocket
const rocketIcon = new L.DivIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="rocket-marker"><path d="M4.5 16.5c-1.5 1.25-2 5-2 5s3.75-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
  className: 'rocket-icon-wrapper',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

interface Position {
  lat: number;
  lng: number;
}

interface TrackingMapProps {
  /** Posición actual del cohete */
  currentPos: Position;
  /** Trayectoria histórica del vuelo */
  trajectory: Position[];
  /** Altura del mapa (opcional) */
  height?: string;
  /** Zoom inicial (opcional) */
  zoom?: number;
}

// Coordenadas por defecto: FIUNA, Paraguay
const DEFAULT_CENTER: [number, number] = [-25.3316, -57.5171];
const MIN_ZOOM = 12;
const MAX_ZOOM = 16;

/**
 * Componente interno para recentrar el mapa automáticamente
 * cuando la posición del cohete cambia
 */
function MapRecenter({ position }: { position: Position }) {
  const map = useMap();

  useEffect(() => {
    if (position.lat !== 0 || position.lng !== 0) {
      map.setView([position.lat, position.lng], map.getZoom(), {
        animate: true,
        duration: 0.5,
      });
    }
  }, [position.lat, position.lng, map]);

  return null;
}

/**
 * Componente para invalidar tamaño del mapa cuando cambia la trayectoria
 * Soluciona el problema de que las líneas no aparecen hasta cambiar de pestaña
 */
function MapUpdater({ trajectoryLength }: { trajectoryLength: number }) {
  const map = useMap();

  useEffect(() => {
    // Pequeño delay para asegurar que el DOM se haya actualizado
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 50);
    
    return () => clearTimeout(timer);
  }, [trajectoryLength, map]);

  return null;
}

/**
 * Componente de Mapa OFFLINE para visualización de trayectoria del cohete
 * 
 * CONFIGURACIÓN:
 * - Tiles locales en: public/maps/{z}/{x}/{y}.png
 * - Rango de zoom: 12-16
 * - Centro por defecto: FIUNA (-25.3316, -57.5171)
 * - Fallback: Tile gris si falta imagen
 * - Ícono personalizado: Logo del proyecto (/logo.png)
 */
export function TrackingMap({ 
  currentPos, 
  trajectory, 
  height = '500px',
  zoom = 14 
}: TrackingMapProps) {
  
  // Centro inicial del mapa
  const center: [number, number] = (currentPos.lat !== 0 || currentPos.lng !== 0)
    ? [currentPos.lat, currentPos.lng]
    : DEFAULT_CENTER;

  return (
    <div className="tracking-map-container" style={{ height }}>
      <MapContainer
        center={center}
        zoom={Math.max(MIN_ZOOM, Math.min(zoom, MAX_ZOOM))} // Clamp zoom entre límites
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        scrollWheelZoom={true}
        className="tracking-map"
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        {/* 
          TileLayer OFFLINE
          Estructura requerida: public/maps/{z}/{x}/{y}.png
          
          errorTileUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
          Si una tile no existe, se muestra un tile gris (errorTileUrl)
        */}
        <TileLayer
          url="/maps/{z}/{x}/{y}.png"
          attribution='&copy; Mapas Offline - FIUNA'
          maxZoom={MAX_ZOOM}
          minZoom={MIN_ZOOM}
          // Tile de error: imagen gris 1x1 en base64
          errorTileUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
          // Opciones para mejorar rendimiento offline
          keepBuffer={4}
          updateWhenZooming={false}
          updateWhenIdle={true}
        />

        {/* Línea de Trayectoria Completa (Estela Cyan) */}
        {trajectory.length > 1 && (
          <Polyline
            key={`trajectory-${trajectory.length}`}
            positions={trajectory.map(pos => [pos.lat, pos.lng])}
            color="#00ccff"           // Color cyan del tema
            weight={3}                 // Grosor de línea
            opacity={0.7}
            className="trajectory-line"
            pane="overlayPane"        // Colocar en pane de bajo nivel
          />
        )}

        {/* Marcadores de rastro (cada 20 puntos) */}
        {trajectory
          .map((pos, originalIndex) => ({ pos, originalIndex }))
          .filter(({ originalIndex }) => originalIndex % 20 === 0)
          .map(({ pos, originalIndex }) => (
            <CircleMarker
              key={`trail-${originalIndex}-${pos.lat.toFixed(6)}-${pos.lng.toFixed(6)}`}
              center={[pos.lat, pos.lng]}
              radius={8}
              pathOptions={{
                color: '#ff3366',
                fillColor: '#ff3366',
                fillOpacity: 0.6,
                weight: 2
              }}
              className="trajectory-trail-marker"
            >
              <Popup>
                <div className="map-popup">
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#ff3366' }}>
                    Punto #{originalIndex}
                  </h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
                    <strong>Lat:</strong> {pos.lat.toFixed(6)}°
                  </p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
                    <strong>Lng:</strong> {pos.lng.toFixed(6)}°
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {/* Marcador de Posición Actual (Logo del Proyecto)
            CRÍTICO: Aparece inmediatamente cuando se reciben coordenadas GPS válidas
            Usa directamente currentPos para posicionamiento en tiempo real
        */}
        {(currentPos.lat !== 0 || currentPos.lng !== 0) && (
          <Marker 
            key={`rocket-${currentPos.lat.toFixed(6)}-${currentPos.lng.toFixed(6)}`}
            position={[currentPos.lat, currentPos.lng]}
            icon={rocketIcon}
            zIndexOffset={10000}
            pane="markerPane"
          >
            <Popup>
              <div className="map-popup">
                <h3 className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-cyan-400" /> 
                  Posición Actual
                </h3>
                <p><strong>Latitud:</strong> {currentPos.lat.toFixed(6)}°</p>
                <p><strong>Longitud:</strong> {currentPos.lng.toFixed(6)}°</p>
                <p><strong>Puntos registrados:</strong> {trajectory.length}</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Componente para recentrar automáticamente */}
        <MapRecenter position={currentPos} />
        
        {/* Componente para forzar actualización del mapa */}
        <MapUpdater trajectoryLength={trajectory.length} />
      </MapContainer>

      {/* Indicador de estado */}
      <div className="map-overlay">
        <div className="map-stats">
          <span className="stat-item flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Lat: {currentPos.lat.toFixed(6)}°
          </span>
          <span className="stat-item flex items-center gap-2">
            <Crosshair className="w-4 h-4" /> Lng: {currentPos.lng.toFixed(6)}°
          </span>
          <span className="stat-item flex items-center gap-2">
            <Navigation className="w-4 h-4" /> Puntos: {trajectory.length}
          </span>
        </div>
      </div>
    </div>
  );
}

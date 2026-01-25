import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Crosshair, Navigation } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './TrackingMap.css';

// Fix para los iconos de Leaflet en Vite
// Los iconos por defecto no se cargan correctamente con Webpack/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
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
 * Componente de Mapa para visualización de trayectoria del cohete
 * 
 * CONFIGURACIÓN OFFLINE:
 * 1. Descarga tiles de OpenStreetMap para tu zona de lanzamiento
 * 2. Coloca las imágenes en: public/maps/{z}/{x}/{y}.png
 * 3. Estructura esperada: public/maps/14/8234/5678.png (ejemplo)
 * 
 * Herramientas recomendadas para descargar tiles:
 * - Mobile Atlas Creator (MOBAC): https://mobac.sourceforge.io/
 * - AllMapSoft Offline Map Maker
 * 
 * Para generar tiles offline:
 * 1. Define tu área de interés (bounding box)
 * 2. Descarga zooms 10-18 (balance entre detalle y tamaño)
 * 3. Formato de salida: PNG
 * 4. Estructura de carpetas: OSM/{z}/{x}/{y}.png
 */
export function TrackingMap({ 
  currentPos, 
  trajectory, 
  height = '500px',
  zoom = 14 
}: TrackingMapProps) {
  
  // Centro inicial del mapa (usar currentPos o un default)
  const center: [number, number] = currentPos.lat !== 0 && currentPos.lng !== 0
    ? [currentPos.lat, currentPos.lng]
    : [-12.0464, -77.0428]; // Lima, Perú como default

  return (
    <div className="tracking-map-container" style={{ height }}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="tracking-map"
        style={{ height: '100%', width: '100%' }}
      >
        {/* 
          TileLayer Offline
          IMPORTANTE: Debes colocar los tiles en public/maps/{z}/{x}/{y}.png
          
          Ejemplo de estructura:
          public/
            maps/
              14/
                8234/
                  5678.png
                  5679.png
              15/
                16468/
                  11356.png
        */}
        <TileLayer
          url="/maps/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={18}
          minZoom={10}
          // Fallback a tiles online si no hay tiles locales (solo en desarrollo)
          errorTileUrl="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Marcador de Posición Actual */}
        {(currentPos.lat !== 0 || currentPos.lng !== 0) && (
          <Marker position={[currentPos.lat, currentPos.lng]}>
            <Popup>
              <div className="map-popup">
                <h3 className="flex items-center gap-2"><Navigation className="w-4 h-4 text-cyan-400" /> Posición Actual</h3>
                <p><strong>Latitud:</strong> {currentPos.lat.toFixed(6)}°</p>
                <p><strong>Longitud:</strong> {currentPos.lng.toFixed(6)}°</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Línea de Trayectoria */}
        {trajectory.length > 1 && (
          <Polyline
            positions={trajectory.map(pos => [pos.lat, pos.lng])}
            color="#ff3366"
            weight={3}
            opacity={0.8}
            dashArray="5, 10"
            pathOptions={{
              className: 'trajectory-line'
            }}
          />
        )}

        {/* Marcadores de trayectoria histórica cada N puntos */}
        {trajectory
          .filter((_, index) => index % 50 === 0) // Mostrar cada 50 puntos
          .map((pos, index) => (
            <Marker
              key={`traj-${index}`}
              position={[pos.lat, pos.lng]}
              icon={L.divIcon({
                className: 'trajectory-marker',
                html: `<div class="trajectory-dot"></div>`,
                iconSize: [8, 8],
              })}
            />
          ))}

        {/* Componente para recentrar automáticamente */}
        <MapRecenter position={currentPos} />
      </MapContainer>

      {/* Indicador de estado */}
      <div className="map-overlay">
        <div className="map-stats">
          <span className="stat-item flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Puntos: {trajectory.length}
          </span>
          <span className="stat-item flex items-center gap-2">
            <Crosshair className="w-4 h-4" /> Lat: {currentPos.lat.toFixed(6)}°
          </span>
          <span className="stat-item flex items-center gap-2">
            <Crosshair className="w-4 h-4" /> Lng: {currentPos.lng.toFixed(6)}°
          </span>
        </div>
      </div>
    </div>
  );
}

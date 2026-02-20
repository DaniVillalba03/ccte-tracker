import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// NOTA: StrictMode deshabilitado para evitar conflicto con Leaflet
// React 19 StrictMode monta componentes 2 veces en desarrollo,
// lo cual causa error "Map container is already initialized" con Leaflet
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);

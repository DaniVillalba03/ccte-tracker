# ARQUITECTURA.md - Ground Station PWA (Offline First)

## 1. Visión General
Software de Estación Terrestre para telemetría de cohetes.
- **Plataforma:** Windows (PWA instalable).
- **Core:** React + TypeScript + Vite.
- **Requisito Crítico:** Funcionamiento 100% Offline y Alta Performance (400Hz ingesta / 60Hz visualización).

## 2. Stack Tecnológico
- **Build Tool:** Vite (con plugin `vite-plugin-pwa`).
- **UI Framework:** React 18+.
- **Lenguaje:** TypeScript (Strict mode).
- **Estado Global:** React Context + Hooks.
- **Hardware I/O:** Web Serial API (Nativa).
- **Visualización 3D:** `@react-three/fiber` (Three.js wrapper).
- **Dashboard:** `react-grid-layout` (Drag & drop widgets).
- **Mapas:** `react-leaflet` (Tiles locales offline en `/public/maps`).
- **Gráficos 2D:** `chart.js` o `recharts`.
- **Almacenamiento:** IndexedDB (vía librería `idb`).
- **Exportación:** `xlsx` (SheetJS) ejecutado en Web Worker.

## 3. Arquitectura de Datos (Patrón High-Frequency)
Para manejar 400Hz sin bloquear el UI Thread:
1.  **Hilo Principal (UI):**
    - Se conecta al puerto Serial.
    - Envía datos crudos ("raw data") inmediatamente al Web Worker.
    - Actualiza una referencia mutable (`useRef`) para visualización a 60fps (requestAnimationFrame).
    - NO guarda en disco, solo visualiza el "último estado conocido".

2.  **Web Worker (`dbWorker.ts`):**
    - Recibe mensajes `DATA_CHUNK`.
    - Realiza "Batching" (acumula ~100 registros en RAM).
    - Escribe en `IndexedDB` en una sola transacción (Bulk Insert).
    - Maneja la generación de reportes Excel (CPU intensive) para no congelar la UI.

## 4. Principios de Diseño (SOLID en React)
- **Separation of Concerns:** La lógica de conexión USB va en hooks (`useSerial`), la lógica de DB en Workers, la UI en componentes puros.
- **Configuration over Implementation:** Los sensores se definen en un archivo de configuración (`sensors.ts`) con metadatos (min, max, unidades). La UI genera los widgets dinámicamente basándose en esta config.

## 5. Estructura de Carpetas Propuesta
- `/src/workers`: Web Workers.
- `/src/hooks`: Lógica de negocio (useSerial, useMap).
- `/src/components/widgets`: Componentes visuales de sensores (Gauge, Chart).
- `/src/components/3d`: Visualización del cohete.
- `/src/services`: Adaptadores para IndexedDB y Serial.
- `/src/types`: Interfaces TypeScript compartidas (TelemetryData, SensorConfig).
/**
 * Relay basado en SSE (Server-Sent Events) + POST.
 *
 * Maestro  → pushTelemetry(data)  → POST /relay/push   (fire-and-forget)
 * Servidor → fan-out SSE          → GET  /relay/stream  (viewers)
 *
 * No requiere ninguna librería extra — usa fetch nativo del navegador.
 */

const PUSH_URL = '/relay/push';

/**
 * Envía un paquete de telemetría al relay de forma asíncrona.
 * Si el servidor no está disponible el error se ignora silenciosamente.
 */
export function pushTelemetry(data: unknown): void {
  fetch(PUSH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  }).catch(() => {}); // fire-and-forget
}

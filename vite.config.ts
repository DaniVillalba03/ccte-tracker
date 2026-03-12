import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Relay SSE embebido en el servidor Vite ──────────────────────────────────
// GET  /relay/stream  → viewers se suscriben (Server-Sent Events)
// POST /relay/push    → master envía telemetría (fire-and-forget fetch)
// Mismo puerto que la app, sin librerías extra, reconexión automática.
function relayPlugin() {
  return {
    name: 'ccte-relay',
    configureServer(server: any) {
      // Set de funciones "send" activas, una por cada viewer conectado
      const clients = new Set<(data: string) => void>();
      let packetsRelayed = 0;

      // ── SSE: viewers escuchan aquí ───────────────────────────────────────
      server.middlewares.use(
        '/relay/stream',
        (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type',  'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection',    'keep-alive');
          res.flushHeaders();

          // Ping cada 20s para mantener la conexión viva (proxies, NAT)
          res.write(': connected\n\n');
          const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);

          const send = (json: string) => res.write(`data: ${json}\n\n`);
          clients.add(send);
          console.log(`\x1b[36m[RELAY] +1 viewer SSE  total=${clients.size}\x1b[0m`);

          req.on('close', () => {
            clients.delete(send);
            clearInterval(heartbeat);
            console.log(`\x1b[36m[RELAY] -1 viewer SSE  total=${clients.size}\x1b[0m`);
          });
        }
      );

      // ── POST: master envía telemetría aquí ──────────────────────────────
      server.middlewares.use(
        '/relay/push',
        (req: IncomingMessage, res: ServerResponse) => {
          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin',  '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.writeHead(204);
            res.end();
            return;
          }
          if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            clients.forEach(send => send(body));
            if (++packetsRelayed % 1_000 === 0)
              console.log(`[RELAY] ${packetsRelayed} paquetes relayed  viewers=${clients.size}`);
            res.writeHead(204);
            res.end();
          });
        }
      );

      console.log('\x1b[32m[RELAY] SSE relay activo → /relay/stream  /relay/push\x1b[0m');
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    relayPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'maps/**/*'],
      manifest: {
        name: 'Ground Station - CCTE Tracker',
        short_name: 'CCTE Tracker',
        description: 'Estación Terrestre para Telemetría de Cohetes - Offline First',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        orientation: 'landscape',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        categories: ['productivity', 'utilities']
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/maps\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'offline-maps-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  server: {
    host: true,       // expone en 0.0.0.0 → accesible desde cualquier IP de la LAN
    port: 5173,
    strictPort: false,
  },
  resolve: {
    alias: {
      // CRÍTICO: Forzar una única instancia de React para evitar "Invalid hook call"
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      
      // Path aliases para imports limpios
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@types': path.resolve(__dirname, './src/types'),
      '@workers': path.resolve(__dirname, './src/workers'),
      '@config': path.resolve(__dirname, './src/config'),
      '@utils': path.resolve(__dirname, './src/utils')
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-grid-layout', 'leaflet', 'chart.js'],
    exclude: ['idb'],
    force: true,
    esbuildOptions: {
      resolveExtensions: ['.js', '.jsx', '.ts', '.tsx']
    }
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
          'charts-vendor': ['chart.js', 'react-chartjs-2'],
          'map-vendor': ['leaflet', 'react-leaflet']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  worker: {
    format: 'es'
  }
});
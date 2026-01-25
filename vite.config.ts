import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
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
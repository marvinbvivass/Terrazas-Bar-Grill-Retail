import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /*
     * Sin esto, recargar la caja sin señal no levanta ni la aplicación: el
     * catálogo está en IndexedDB, pero el HTML y el JavaScript vienen de la red.
     * El service worker cachea el app-shell para que la caja arranque igual con
     * el módem apagado. Lo destapó la prueba de extremo a extremo, no el diseño.
     */
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // La fuente de Google se sirve desde caché con refresco en segundo plano:
        // que no haya señal no puede cambiar cómo se ve la caja.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fuentes',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Caja · Licorería',
        short_name: 'Caja',
        description: 'Punto de venta e inventario de licorería. Funciona sin conexión.',
        theme_color: '#0e1512',
        background_color: '#0e1512',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

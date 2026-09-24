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
      /*
       * El manifest es lo que decide cómo se instala en Android. Tres cosas
       * importan y las tres estaban mal para un teléfono:
       *
       *  - `orientation` era 'landscape', que en un móvil fuerza al usuario a
       *    girar el aparato para usar la aplicación. Ahora es 'portrait'.
       *  - `lang` decía 'en', y Android lo usa para el idioma del atajo.
       *  - `display_override` con 'standalone' primero evita que algunos
       *    lanzadores la abran como pestaña de navegador con barra de URL.
       */
      manifest: {
        name: 'Terrazas Bar Grill',
        short_name: 'Terrazas',
        description: 'Inventario, ventas y cuentas por cobrar. Funciona sin conexión.',
        lang: 'es',
        dir: 'ltr',
        theme_color: '#2563eb',
        background_color: '#eef2f7',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Separar el SDK de Firebase del código propio: cambia mucho menos, así
        // que se queda cacheado entre despliegues en vez de rebajarse entero.
        manualChunks(id) {
          // Firestore aparte de Auth: el arranque solo necesita Auth, y
          // Firestore puede seguir bajando mientras el encargado ya carga.
          if (id.includes('@firebase/firestore') || id.includes('firebase/firestore')) {
            return 'firebase-firestore'
          }
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase-auth'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

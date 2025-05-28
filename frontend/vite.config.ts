import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'XCargo - Sistema de Gestión',
        short_name: 'XCargo',
        description: 'Sistema de gestión de conductores, pagos y entregas',
        theme_color: '#10b981',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/Logo192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/Logo512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
        "screenshots": [
    {
      "src": "/icons/LogoXBlancoo.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    },
    {
      "src": "/icons/LogoXBlancoM.png",
      "sizes": "640x360",
      "type": "image/png",
      "form_factor": "narrow"
    }
  ]
      },
      devOptions: {
        enabled: true // Habilita PWA en desarrollo
      }
    })
  ]
})
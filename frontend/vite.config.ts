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
            src: '/icons/LogoX192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/LogoX512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      devOptions: {
        enabled: true // Habilita PWA en desarrollo
      }
    })
  ]
})
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
declare global {
  const __APP_VERSION__: string;
}

import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Sesli Sohbet',
        short_name: 'Sesli',
        description: 'Sesli Sohbet Uygulaması',
        theme_color: '#36393f',
        background_color: '#36393f',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  define: {
    '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
  },
})

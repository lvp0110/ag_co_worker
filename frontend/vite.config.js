import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'
import { join } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Auth/calc: локально :3005, либо staging в .env.development.local:
  //   AUTH_PROXY_TARGET=https://dev3.constrtodo.ru:3005
  //   CALC_PROXY_TARGET=https://dev3.constrtodo.ru:3005
  const authTarget =
    env.AUTH_PROXY_TARGET || process.env.AUTH_PROXY_TARGET || 'http://localhost:3005'
  const calcTarget =
    env.CALC_PROXY_TARGET || process.env.CALC_PROXY_TARGET || 'http://localhost:3005'
  const backendTarget =
    env.BACKEND_PROXY_TARGET || process.env.BACKEND_PROXY_TARGET || 'http://localhost:3007'

  return {
  base: process.env.BASE_PATH || env.BASE_PATH || '/',
  plugins: [
    react(),
    {
      name: 'copy-404',
      closeBundle() {
        const distPath = join(process.cwd(), 'dist')
        try {
          copyFileSync(join(distPath, 'index.html'), join(distPath, '404.html'))
        } catch (error) {
          console.warn('Could not copy index.html to 404.html:', error.message)
        }
      },
    },
  ],
  server: {
    host: true,
    port: 5175,
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' || env.CHOKIDAR_USEPOLLING === 'true',
    },
    proxy: {
      // Auth same-origin → cookies first-party (не бьём напрямую в :3005 с фронта).
      '/login': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
      },
      '/auth': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/v1': {
        target: calcTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/v2': {
        target: calcTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  }
})

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Vite `base` — только pathname со слэшами. Полный URL ломает GH Pages (двойной путь). */
function normalizeBase(raw) {
  let v = String(raw || '/').trim()
  if (!v) return '/'
  if (/^https?:\/\//i.test(v)) {
    try {
      v = new URL(v).pathname
    } catch {
      v = '/'
    }
  }
  if (!v.startsWith('/')) v = `/${v}`
  if (!v.endsWith('/')) v = `${v}/`
  return v
}

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

  /** HTML-навигация на /admin/materials/:code → SPA; fetch с Accept: json → API. */
  const bypassAdminSpaNavigation = (req) => {
    const accept = String(req.headers.accept || '')
    if (accept.includes('text/html')) return '/index.html'
  }

  return {
  base: normalizeBase(process.env.BASE_PATH || env.BASE_PATH || '/'),
  plugins: [
    react(),
    // SPA на GitHub Pages: 404.html + .nojekyll (иначе Jekyll может отдать README)
    {
      name: 'gh-pages-spa',
      closeBundle() {
        const distPath = join(process.cwd(), 'dist')
        try {
          copyFileSync(join(distPath, 'index.html'), join(distPath, '404.html'))
        } catch (error) {
          console.warn('Could not copy index.html to 404.html:', error.message)
        }
        try {
          writeFileSync(join(distPath, '.nojekyll'), '')
        } catch (error) {
          console.warn('Could not write .nojekyll:', error.message)
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
      // Admin materials/constructions/commerce API (:3005). Точный /admin — SPA-роут.
      '/admin/materials': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
        bypass: bypassAdminSpaNavigation,
      },
      '/admin/constructions': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
        bypass: bypassAdminSpaNavigation,
      },
      '/admin/commerce': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
      },
      '/admin/images': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
      },
      // Картинки из админки лежат в MinIO AUTH, не на CALC/staging.
      '/api/v2/public/image': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
      },
      // CMS warning-блоки для size-limits (роль manager).
      '/content': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
      },
      // Commerce price-list + regions (same auth cookies as /admin).
      '/commerce': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
      },
      // Unmatched import list и справочник типов конструкций живут на том же
      // сервисе, что и /admin/materials. Не через CALC_PROXY_TARGET: в .env
      // часто staging, а materials/types — localhost.
      '/api/v2/data/unmatched': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/v2/constructions': {
        target: authTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/v2/calculations': {
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

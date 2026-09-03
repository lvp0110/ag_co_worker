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
  // Один upstream на всё: auth, calc, админ-API и 1С — это сервис ConstrTodo.
  // Локально :3005, либо staging в .env.development.local:
  //   UPSTREAM_TARGET=https://dev3.constrtodo.ru:3005
  // AUTH_PROXY_TARGET / CALC_PROXY_TARGET читаем для совместимости со старыми
  // локальными .env.
  const upstreamTarget =
    env.UPSTREAM_TARGET ||
    process.env.UPSTREAM_TARGET ||
    env.AUTH_PROXY_TARGET ||
    process.env.AUTH_PROXY_TARGET ||
    env.CALC_PROXY_TARGET ||
    process.env.CALC_PROXY_TARGET ||
    'http://localhost:3005'

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
    // Тот же набор путей, что проксирует frontend/server.js в проде: всё уходит
    // в один upstream, поэтому cookies остаются same-origin.
    // `/admin/...` — и API, и SPA-роуты карточек, они разводятся по Accept.
    proxy: {
      '/login': { target: upstreamTarget, changeOrigin: true, secure: false },
      '/auth': { target: upstreamTarget, changeOrigin: true, secure: false },
      '/api': { target: upstreamTarget, changeOrigin: true, secure: false },
      '/integration': { target: upstreamTarget, changeOrigin: true, secure: false },
      '/content': { target: upstreamTarget, changeOrigin: true, secure: false },
      '/commerce': { target: upstreamTarget, changeOrigin: true, secure: false },
      '/admin/materials': {
        target: upstreamTarget,
        changeOrigin: true,
        secure: false,
        bypass: bypassAdminSpaNavigation,
      },
      '/admin/constructions': {
        target: upstreamTarget,
        changeOrigin: true,
        secure: false,
        bypass: bypassAdminSpaNavigation,
      },
      '/admin/commerce': { target: upstreamTarget, changeOrigin: true, secure: false },
      '/admin/images': { target: upstreamTarget, changeOrigin: true, secure: false },
    },
  },
  }
})

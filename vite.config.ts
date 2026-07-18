import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import hostingConfig from './.openai/hosting.json'
import { sites } from './build/sites-vite-plugin'

const staticAssetCache = (): Plugin => ({
  name: 'fuchong-static-asset-cache',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/assets/'))
        res.setHeader('Cache-Control', 'public,max-age=31536000,immutable')
      next()
    })
  },
})

// https://vite.dev/config/
export default defineConfig(async () => {
  const { cloudflare } = await import('@cloudflare/vite-plugin')
  return {
    server: {
      watch: {
        ignored: ['**/server/data/**', '**/server/uploads/**', '**/server/backups/**'],
      },
    },
    plugins: [
      react(),
      staticAssetCache(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'server' },
        config: {
          main: './worker/index.js',
          compatibility_date: '2026-07-16',
          compatibility_flags: ['nodejs_compat'],
          assets: {
            binding: 'ASSETS',
            not_found_handling: 'single-page-application',
            run_worker_first: ['/api/*', '/uploads/*'],
          },
          d1_databases: hostingConfig.d1 ? [{
            binding: hostingConfig.d1,
            database_name: 'fuchong-production',
            database_id: '00000000-0000-4000-8000-000000000000',
          }] : [],
          r2_buckets: hostingConfig.r2 ? [{
            binding: hostingConfig.r2,
            bucket_name: 'fuchong-media',
          }] : [],
        },
      }),
    ],
  }
})

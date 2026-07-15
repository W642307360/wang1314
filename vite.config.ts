import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
export default defineConfig({
  plugins: [react(), staticAssetCache()],
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev has no serverless runtime; forward /api to the deployment
    proxy: {
      '/api': {
        target: 'https://chronograph-coral.vercel.app',
        changeOrigin: true,
      },
    },
  },
})

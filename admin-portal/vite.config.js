import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api/admin': 'http://127.0.0.1:3001',
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000'
    }
  }
})

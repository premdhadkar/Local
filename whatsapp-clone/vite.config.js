import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { 
    port: 5173, 
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000',
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true
      }
    }
  }
})

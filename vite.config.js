import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 3021,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_CHECKOUT_PROXY_TARGET || loadEnv(mode, process.cwd(), 'VITE_').VITE_CHECKOUT_PROXY_TARGET || 'http://localhost:8120',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 3021, strictPort: true },
}));

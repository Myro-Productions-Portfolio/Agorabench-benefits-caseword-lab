import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, 'src/casework-ui'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@core': path.resolve(__dirname, 'src/casework-core'),
      '@api': path.resolve(__dirname, 'src/casework-api'),
      '@worker': path.resolve(__dirname, 'src/casework-worker'),
      '@db': path.resolve(__dirname, 'src/db'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3002', ws: true },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
});

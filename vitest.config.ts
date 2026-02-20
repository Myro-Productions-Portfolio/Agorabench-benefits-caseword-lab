import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@core': path.resolve(__dirname, 'src/casework-core'),
      '@api': path.resolve(__dirname, 'src/casework-api'),
      '@worker': path.resolve(__dirname, 'src/casework-worker'),
      '@ui': path.resolve(__dirname, 'src/casework-ui'),
      '@db': path.resolve(__dirname, 'src/db'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
  },
});

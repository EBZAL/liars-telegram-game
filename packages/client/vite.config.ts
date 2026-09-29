import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'node:crypto': path.resolve(__dirname, 'src/crypto-shim.ts'),
      'node:buffer': path.resolve(__dirname, 'src/buffer-shim.ts'),
      'buffer': path.resolve(__dirname, 'src/buffer-shim.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});

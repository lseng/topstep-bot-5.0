import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, '../public'),
    emptyOutDir: true,
  },
  server: {
    port: 9213,
    proxy: {
      '/api': {
        target: 'http://localhost:9113',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@dashboard': path.resolve(__dirname, 'src'),
    },
  },
});

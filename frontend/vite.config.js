import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local (npm run dev): 5173 -> backend 5000, pehle jaisa.
// Production (npm run preview, build ke baad): 4412 -> backend 4402.
// Backend khud bhi production me build serve karta hai, to sirf 4402 se bhi app chalti hai.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:5000',
      '/api': 'http://localhost:5000',
    },
  },
  preview: {
    port: 4412,
    strictPort: true,
    proxy: {
      '/auth': 'http://localhost:4402',
      '/api': 'http://localhost:4402',
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // acessível pelo celular na mesma rede
    proxy: {
      // encaminha as chamadas /api para o backend
      '/api': 'http://localhost:4000',
    },
  },
});

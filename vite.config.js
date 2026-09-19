import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em produção o Vercel serve o site (dist) e as funções em /api juntos.
// Em desenvolvimento, use `vercel dev` para ter o /api/token funcionando,
// ou defina VITE_MAPKIT_TOKEN no .env para testar só com `npm run dev`.
export default defineConfig({
  plugins: [react()],
  server: { host: true },
});

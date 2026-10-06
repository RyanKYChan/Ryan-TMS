import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], root: 'client', server: { hmr: { port: Number(process.env.PORT || 3000) + 10000 } }, build: { outDir: '../dist', emptyOutDir: true } });

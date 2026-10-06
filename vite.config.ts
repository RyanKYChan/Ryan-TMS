import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
const version=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version;
export default defineConfig({ define: { __APP_VERSION__: JSON.stringify(version) }, plugins: [react()], root: 'client', server: { hmr: { port: Number(process.env.PORT || 3000) + 10000 } }, build: { outDir: '../dist', emptyOutDir: true } });

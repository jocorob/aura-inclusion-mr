import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: permite desplegar en https://usuario.github.io/repositorio/
  base: './',
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});

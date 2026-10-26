import { defineConfig } from 'vite';

// The demo is built into the repository root, because that is what GitHub Pages serves.
export default defineConfig({
  base: './',
  server: { port: 3000 },
  build: {
    outDir: '..',
    emptyOutDir: false,
    assetsInlineLimit: 0,
  },
  assetsInclude: ['**/*.vrm', '**/*.fbx', '**/*.glb'],
});
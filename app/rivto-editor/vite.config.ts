/**
 * Bundles the desktop renderer against the existing workspace package sources.
 * Relative assets allow Electron to load the output without a web server or a
 * prebuilt demo application.
 */
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'renderer',
  esbuild: { jsx: 'automatic' },
  base: './',
  build: { outDir: '../dist/renderer', emptyOutDir: true },
  // Compiles the editor's Tailwind source stylesheet aliased below.
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      {
        find: '@chulane/rivto-react/styles.css',
        replacement: fileURLToPath(new URL('../../packages/react-rivto-editor/src/styles/index.css', import.meta.url)),
      },
      {
        find: /^@chulane\/rivto-react$/,
        replacement: fileURLToPath(new URL('../../packages/react-rivto-editor/src/index.ts', import.meta.url)),
      },
      {
        find: /^@chulane\/rivto$/,
        replacement: fileURLToPath(new URL('../../packages/rivto-editor-core/src/index.ts', import.meta.url)),
      },
      {
        find: /^@chulane\/crdt-doc$/,
        replacement: fileURLToPath(new URL('../../packages/crdt-doc/src/index.ts', import.meta.url)),
      },
      {
        find: /^@chulane\/document-model$/,
        replacement: fileURLToPath(new URL('../../packages/document-model/src/index.ts', import.meta.url)),
      },
    ],
    dedupe: ['react', 'react-dom'],
  },
});

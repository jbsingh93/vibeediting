/**
 * ui-app/vite.config.ts — the cockpit client build.
 *
 * The client is PREBUILT at publish time into ui-dist/ (ships in the npm `files` whitelist —
 * the user never runs Vite; `vibe ui` serves the static bundle). Dev mode (`npm run ui:dev`)
 * proxies /api + /ws (+ the media mounts) to a running `vibe ui --no-open` on :7878.
 *
 * The demo composition is bundled FROM the template payload (../template/src/demo-welcome) so
 * the out-of-box preview works without importing user code — a prebuilt client can never load
 * the user's own comps; their editing surface is the data-driven FineTunePreview instead.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  publicDir: false, // project media is served by the Fastify server, never bundled
  plugins: [react()],
  build: {
    outDir: path.resolve(here, '..', 'ui-dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
    fs: {
      // allow importing the demo comp + components from the template payload
      allow: [here, path.resolve(here, '..', 'template')],
    },
    proxy: {
      '/api': { target: 'http://localhost:7878', changeOrigin: true },
      '/ws': { target: 'ws://localhost:7878', ws: true },
      '/work': { target: 'http://localhost:7878', changeOrigin: true },
      '/deliver': { target: 'http://localhost:7878', changeOrigin: true },
      '/out': { target: 'http://localhost:7878', changeOrigin: true },
    },
  },
});

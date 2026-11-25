/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Privacy: the built site may not make any network request. connect-src 'none' blocks fetch/XHR/beacons.
// Added only to the production build, because the dev server injects an inline script for hot reload.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "connect-src 'none'; form-action 'none'; base-uri 'self'; object-src 'none'";

const cspPlugin = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// `base` is relative so the built site works from any path, including GitHub Pages project sites.
export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  test: {
    globals: true,
    environment: 'node',
  },
});

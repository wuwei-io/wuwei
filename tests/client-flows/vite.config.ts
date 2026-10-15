import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export default defineConfig({
  root: resolve(repo, 'desktop/renderer'),
  logLevel: 'error',
  plugins: [react(), {
    name: 'qa-relative-js-to-ts',
    resolveId(source, importer) {
      if (importer && source.startsWith('.') && source.endsWith('.js')) {
        for (const ext of ['.ts', '.tsx']) {
          const candidate = resolve(dirname(importer), source).replace(/\.js$/, ext);
          if (existsSync(candidate)) return candidate;
        }
      }
    },
  }],
  server: { host: '127.0.0.1', port: 5191, strictPort: true, fs: { allow: [repo] } },
});

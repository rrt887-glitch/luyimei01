import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { SECURITY_HEADERS } from './src/config/securityHeaders.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'lucide-react',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'firebase/storage',
        'firebase/functions',
        'firebase/app-check',
      ],
    },
    build: {
      rolldownOptions: {
        output: {
          // Firebase is the bulk of the code the site needs on every visit. Split it by product so
          // no single file is over ~500 kB, the parts download in parallel, and a change in one
          // (e.g. an Auth update) does not invalidate the cached others.
          codeSplitting: {
            groups: [
              { name: 'vendor-firestore', test: /node_modules[\\/](@firebase[\\/](firestore|webchannel-wrapper)|re2js)[\\/]/ },
              { name: 'vendor-auth', test: /node_modules[\\/]@firebase[\\/](auth|app-check)[\\/]/ },
              { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }
            ]
          }
        }
      }
    },
    server: {
      headers: SECURITY_HEADERS,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      headers: SECURITY_HEADERS,
    },
  };
});

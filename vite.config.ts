import { defineConfig, Plugin } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/**
 * Vite plugin to resolve figma:asset/* imports locally.
 * In the Figma Make environment these are handled by their runtime,
 * but locally we return a 1×1 transparent PNG data-URI placeholder.
 */
function figmaAssetPlugin(): Plugin {
  return {
    name: 'figma-asset-resolver',
    resolveId(source) {
      if (source.startsWith('figma:asset/')) {
        return `\0${source}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith('\0figma:asset/')) {
        // Return a 1x1 transparent PNG as a data URI
        return `export default "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="`;
      }
      return null;
    },
  };
}

/**
 * The app's screens have their own addresses (/dashboard/, /records/, ...; see VIEW_PATHS in App.tsx).
 * GitHub Pages only serves files, so the build copies Moon Studio's page into each screen's folder,
 * and the dev server answers those addresses with it too. Its asset links are relative (../assets/),
 * which works from any folder at the same depth.
 */
const SCREEN_FOLDERS = ['dashboard', 'records', 'search', 'authors', 'activity', 'entities', 'acquisitions', 'technical', 'circulation', 'catalogue', 'new', 'desk'];
function screenPagesPlugin(): Plugin {
  return {
    name: 'moon-screen-pages',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url || '').split('?');
        const folder = pathname.replace(/^\/|\/$/g, '');
        if (SCREEN_FOLDERS.includes(folder)) req.url = `/moon/index.html${query ? `?${query}` : ''}`;
        next();
      });
    },
    closeBundle() {
      const page = path.resolve(__dirname, 'dist/moon/index.html');
      if (!fs.existsSync(page)) return;
      for (const folder of SCREEN_FOLDERS) {
        fs.mkdirSync(path.resolve(__dirname, 'dist', folder), { recursive: true });
        fs.copyFileSync(page, path.resolve(__dirname, 'dist', folder, 'index.html'));
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    figmaAssetPlugin(),
    screenPagesPlugin(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
      // Alias /utils used by some components (absolute path imports)
      '/utils': path.resolve(__dirname, './utils'),
    },
  },

  server: {
    open: true,
    proxy: {
      '/okapi': {
        target: 'http://localhost:9130',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/okapi/, ''),
      },
      '/vufind': {
        target: 'http://localhost:8085',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/vufind/, ''),
      },
      '/solr': {
        target: 'http://localhost:8983',
        changeOrigin: true,
      },
      '/bcld-api': {
        target: 'https://dev.bcld.info/api',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/bcld-api/, ''),
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    chunkSizeWarningLimit: 3500,
    rollupOptions: {
      input: {
        // index.html only forwards to /moon/, where Moon Studio lives.
        main: path.resolve(__dirname, 'index.html'),
        moon: path.resolve(__dirname, 'moon/index.html'),
        opac: path.resolve(__dirname, 'opac.html'),
      },
    },
  },
})
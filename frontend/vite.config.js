import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'icons/*.png'],
      manifest: {
        name:             'Vyapari — Business Accounting',
        short_name:       'Vyapari',
        description:      'GST billing and accounting app for Indian businesses',
        theme_color:      '#0f172a',
        background_color: '#0f172a',
        display:          'standalone',
        orientation:      'any',
        start_url:        '/',
        scope:            '/',
        lang:             'en-IN',
        categories:       ['finance', 'business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Don't cache API calls in the service worker — handled by syncEngine
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],

  // Dev server — proxies /api to backend at localhost:5000
  server: {
    port:  3000,
    proxy: {
      '/api': {
        target:       'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir:        'dist',
    sourcemap:     false,          // Never expose source maps in production
    // Split vendor chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          react:    ['react', 'react-dom', 'react-router-dom'],
          charts:   ['recharts'],
          ui:       ['lucide-react'],
          utils:    ['date-fns', 'idb', 'axios'],
        },
      },
    },
  },

  // Expose only VITE_* prefixed variables to the browser bundle
  // Never expose backend secrets through this mechanism
  envPrefix: 'VITE_',
});

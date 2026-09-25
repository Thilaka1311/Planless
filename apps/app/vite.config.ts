import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: [
          'favicon.ico',
          'favicon-32x32.png',
          'favicon-16x16.png',
          'apple-touch-icon.png',
          'maskable-icon-512x512.png',
          'pwa-192x192.png',
          'pwa-512x512.png'
        ],
        manifest: {
          name: 'Planless',
          short_name: 'Planless',
          description: 'Planless',
          theme_color: '#050505',
          background_color: '#050505',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Precache static assets like CSS, JS, HTML, fonts, and core images
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,otf,ttf}'],
          // Exclude unused or non-core static files from precache
          globIgnores: ['**/navkis_matchday.png'],
          // Exclude Supabase to ensure Realtime, Auth, and DB endpoints remain network-live
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/auth\/v1\//,
            /^\/rest\/v1\//,
            /^\/storage\/v1\//,
            /^\/realtime\/v1\//,
            /^\/functions\/v1\//,
            /^\/\.well-known\//,
            /.*supabase\.co.*/,
            /.*\.ngrok(-free)?\.(app|dev).*/,
          ],
          runtimeCaching: [
            {
              urlPattern: /.*supabase\.co.*/,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'supabase-network-only',
              },
            },
            {
              urlPattern: /^https?:\/\/.*\/((auth|rest|storage|realtime|functions)\/v1)/,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'supabase-local-network-only',
              },
            },
            // Cache Google Fonts stylesheets with StaleWhileRevalidate
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // Cache Google Fonts webfont files with CacheFirst (1 year max age)
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ]
        },
        devOptions: {
          enabled: false
        }
      })
    ],
    envDir: path.resolve(__dirname, '../..'),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: true, // Expose to local network so phones on the same WiFi can connect
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR === 'true' ? false : {
        overlay: false,
      },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: true as const,
    },
    preview: {
      allowedHosts: true as const,
    },
  };
});

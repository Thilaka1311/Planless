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
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'maskable-icon-512x512.png'],
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
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
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
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Precache static assets like CSS, JS, HTML and common images
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // Exclude Supabase to ensure Realtime, Auth, and DB endpoints remain network-live
          navigateFallbackDenylist: [/^\/api\//, /.*supabase\.co.*/],
          runtimeCaching: [
            {
              urlPattern: /.*supabase\.co.*/,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'supabase-network-only',
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

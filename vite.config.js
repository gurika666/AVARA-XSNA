import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: '/',
  root: './',
  publicDir: 'public',
  
  resolve: {
    alias: {
      "~": resolve(__dirname, "./src"),
      "@": resolve(__dirname, "./public"),
    },
  },
  
  server: {
    host: '0.0.0.0',
    port: 5000,
    open: false,
    cors: true,
  },
  
  preview: {
    port: 8080
  },
  
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
    
    // Ensure preview.jpg stays at root
    assetsInlineLimit: 0,
    
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: (id) => {
          if (id.includes('three') && !id.includes('examples')) {
            return 'three-core';
          }
          if (id.includes('three/examples')) {
            return 'three-extras';
          }
          if (id.includes('@rive-app')) {
            return 'rive';
          }
          if (id.includes('@mediapipe')) {
            return 'mediapipe';
          }
          if (id.includes('node_modules') && 
              !id.includes('three') && 
              !id.includes('@rive-app') && 
              !id.includes('@mediapipe')) {
            return 'vendor';
          }
        },
        assetFileNames: (assetInfo) => {
          // Keep preview.jpg at root
          if (assetInfo.name === 'preview.jpg') {
            return '[name][extname]';
          }
          
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          } else if (/woff|woff2|ttf|otf|eot/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      }
    },
    
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: true
      }
    },
    
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  
  optimizeDeps: {
    include: [
      'three',
      '@rive-app/webgl2',
      '@rive-app/canvas',
      'gsap'
    ],
    exclude: [
      '@mediapipe/hands'
    ]
  }
});
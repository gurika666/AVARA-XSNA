import { defineConfig } from "vite";
import { resolve } from "path";
import { createHtmlPlugin } from 'vite-plugin-html';

// Configure your site URL here
const SITE_URL = 'https://xsna.life'; // Update this to your actual domain

export default defineConfig({
  base: process.env.NODE_ENV == 'production' ? '' : '/',
  root: './',
  publicDir: 'public',
  
  plugins: [
    createHtmlPlugin({
      minify: true,
      entry: 'src/js/app.js',
      template: 'index.html',
      
      inject: {
        data: {
          title: 'XSNA - Interactive Music Experience',
          injectScript: `<script src="./inject.js"></script>`,
        },
        tags: [
          // Basic Meta Tags
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              charset: 'UTF-8'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'viewport',
              content: 'width=device-width, initial-scale=1.0'
            }
          },
          
          // SEO Meta Tags
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'description',
              content: 'Experience XSNA - An immersive 3D music visualization with interactive controls and stunning visual effects'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'keywords',
              content: 'XSNA, music visualizer, WebGL, Three.js, 3D graphics, interactive music, audio visualization, AVARA'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'author',
              content: 'AVARA'
            }
          },
          
          // Open Graph tags (Facebook, LinkedIn, etc.)
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:title',
              content: 'XSNA - Interactive Music Visualizer'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:description',
              content: 'Immersive 3D music experience with real-time visual effects'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:image',
              content: `${SITE_URL}/preview.jpg` // Absolute URL to your preview image
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:image:width',
              content: '1200'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:image:height',
              content: '630'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:image:alt',
              content: 'XSNA - Interactive 3D Music Visualizer Preview'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:url',
              content: SITE_URL
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:type',
              content: 'website'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:site_name',
              content: 'XSNA'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              property: 'og:locale',
              content: 'en_US'
            }
          },
          
          // Twitter Card tags
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'twitter:card',
              content: 'summary_large_image'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'twitter:title',
              content: 'XSNA - Interactive Music Visualizer'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'twitter:description',
              content: 'Immersive 3D music visualization experience'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'twitter:image',
              content: `${SITE_URL}/preview.jpg`
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'twitter:image:alt',
              content: 'XSNA Music Visualizer Preview'
            }
          },
          
          // Additional meta tags for better SEO
          {
            injectTo: 'head-prepend',
            tag: 'meta',
            attrs: {
              name: 'robots',
              content: 'index, follow'
            }
          },
          {
            injectTo: 'head-prepend',
            tag: 'link',
            attrs: {
              rel: 'canonical',
              href: SITE_URL
            }
          },
          
          // Structured Data (JSON-LD)
          {
            injectTo: 'head',
            tag: 'script',
            attrs: {
              type: 'application/ld+json'
            },
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "XSNA",
              "description": "Interactive 3D music visualizer with WebGL",
              "applicationCategory": "MultimediaApplication",
              "operatingSystem": "Any",
              "browserRequirements": "Requires JavaScript. Requires HTML5.",
              "url": SITE_URL,
              "image": `${SITE_URL}/preview.jpg`,
              "author": {
                "@type": "Organization",
                "name": "AVARA",
                "url": SITE_URL
              },
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              }
            })
          },
          
          // Preload critical resources
          {
            injectTo: 'head',
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: '/fonts/Monarch.woff2',
              as: 'font',
              type: 'font/woff2',
              crossorigin: 'anonymous'
            }
          },
          {
            injectTo: 'head',
            tag: 'link',
            attrs: {
              rel: 'preconnect',
              href: 'https://cdnjs.cloudflare.com'
            }
          },
          
          // Favicon
          {
            injectTo: 'head',
            tag: 'link',
            attrs: {
              rel: 'icon',
              type: 'image/x-icon',
              href: '/favicon.ico'
            }
          },
          
          // Hidden SEO content for crawlers
          {
            injectTo: 'body-prepend',
            tag: 'div',
            attrs: {
              id: 'seo-content',
              style: 'position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden;'
            },
            children: `
              <h1>XSNA Music Visualizer</h1>
              <h2>Interactive 3D Audio Visualization Experience</h2>
              <p>Experience immersive music with real-time 3D graphics, particle effects, and interactive controls.</p>
              <p>Created by AVARA - Push play to begin your journey through sound and vision.</p>
            `
          },
          
          // The original body-prepend div from your config
          {
            injectTo: 'body-prepend',
            tag: 'div',
            attrs: {
              id: 'tag',
            },
          },
        ],
      },
    }),
  ],
  
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
    
    // Optimize chunks for better loading
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Three.js core
          if (id.includes('three') && !id.includes('examples')) {
            return 'three-core';
          }
          // Three.js examples (loaders, post-processing)
          if (id.includes('three/examples')) {
            return 'three-extras';
          }
          // Rive animations
          if (id.includes('@rive-app')) {
            return 'rive';
          }
          // Media libraries
          if (id.includes('@mediapipe')) {
            return 'mediapipe';
          }
          // Other vendor libraries
          if (id.includes('node_modules') && 
              !id.includes('three') && 
              !id.includes('@rive-app') && 
              !id.includes('@mediapipe')) {
            return 'vendor';
          }
        },
        // Asset file naming
        assetFileNames: (assetInfo) => {
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
    
    // Minification options
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: true
      }
    },
    
    // Generate source maps only for development
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'three',
      '@rive-app/webgl2',
      '@rive-app/canvas',
      'gsap'
    ],
    exclude: [
      '@mediapipe/hands' // Often causes issues with optimization
    ]
  }
});
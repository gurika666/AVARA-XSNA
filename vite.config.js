import { defineConfig } from "vite";
import {resolve} from "path";

import { createHtmlPlugin } from 'vite-plugin-html'

export default defineConfig ({
    base: process.env.NODE_ENV == 'production' ? '' : '/',
    root: './',
    publicDir: 'public',
    plugins: [
        createHtmlPlugin({
          minify: true,
          /**
           * After writing entry here, you will not need to add script tags in `index.html`, the original tags need to be deleted
           * @default src/js/main.js
           */
          entry: 'src/js/app.js',
          /**
           * If you want to store `index.html` in the specified folder, you can modify it, otherwise no configuration is required
           * @default index.html
           */
          template: 'index.html',
    
          /**
           * Data that needs to be injected into the index.html ejs template
           */
          inject: {
            data: {
              title: 'index',
              injectScript: `<script src="./inject.js"></script>`,
            },
            tags: [
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
    },
})
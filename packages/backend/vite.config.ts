import { defineConfig } from 'vite'
import { builtinModules } from 'module'

export default defineConfig({
  build: {
    target: 'node18',
    outDir: 'build',
    lib: {
      entry: 'src/app.ts',
      name: 'backend',
      formats: ['es'],
      fileName: 'app'
    },
    rollupOptions: {
      external: [
        // Node.js built-in modules
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
        // Dependencies with native bindings or that should remain external
        'mongoose',
        'sharp',
        'pdfkit',
        'canvas',
        'express',
        'cors',
        'dotenv',
        'jsonwebtoken',
        'lodash',
        'multer',
        'node-geocoder',
        'winston',
        'xml2js',
        'body-parser',
        'method-override',
        'array-unique',
        'date-fns',
        'join-images',
        'png-crop',
        'pngjs'
      ]
    },
    minify: false,
    sourcemap: true
  },
  define: {
    global: 'globalThis'
  }
})

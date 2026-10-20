import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src',
  envDir: import.meta.dirname,
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main:        resolve(import.meta.dirname, 'src/index.html'),
        setup:       resolve(import.meta.dirname, 'src/pages/setup/index.html'),
        control:     resolve(import.meta.dirname, 'src/pages/control/index.html'),
        scoreboard:  resolve(import.meta.dirname, 'src/pages/scoreboard/index.html'),
        notFound:    resolve(import.meta.dirname, 'src/404.html'),
        serverError: resolve(import.meta.dirname, 'src/500.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase'
          }
        }
      }
    }
  }
})

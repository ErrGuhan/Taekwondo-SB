import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src',
  envDir: resolve(__dirname),
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main:       resolve(__dirname, 'src/index.html'),
        setup:      resolve(__dirname, 'src/pages/setup/index.html'),
        control:    resolve(__dirname, 'src/pages/control/index.html'),
        scoreboard: resolve(__dirname, 'src/pages/scoreboard/index.html'),
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

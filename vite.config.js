import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// FuturisticBD Newsroom — Vite + React build.
// `public/news-data.json` is copied verbatim to the output root and served at /news-data.json.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // three.js is large; keep it in its own chunk so the app shell stays light.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          motion: ['gsap', 'lenis'],
        },
      },
    },
  },
})

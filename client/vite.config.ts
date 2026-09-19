import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader';
import vueJsx from '@vitejs/plugin-vue-jsx'
import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwind(), vue(), vueJsx(), svgLoader()],
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  resolve: {
    dedupe: ['vue', '@internationalized/date'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

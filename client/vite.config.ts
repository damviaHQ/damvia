/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader';
import vueJsx from '@vitejs/plugin-vue-jsx'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/vite'

// DAMVIA_MODULES lists the modules built into this client: packages, or paths
// from the client folder, separated by commas. Each one's client part is its
// "client" entry, compiled with the core. See docs/contributing/modules.md.
export function damviaModules(): Plugin {
  const id = '\0virtual:damvia-modules'
  let entries: string[] = []
  return {
    name: 'damvia-modules',
    // Before Tailwind, which then also scans the modules' files: it skips node_modules otherwise.
    enforce: 'pre',
    config(_, { mode }) {
      const listed = (loadEnv(mode, process.cwd(), '').DAMVIA_MODULES ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
      entries = listed.map((entry) => `${entry.startsWith('.') ? resolve(entry) : entry}/client`)
      // Served from their sources like the core's, never pre-bundled: esbuild cannot read .vue files.
      return { optimizeDeps: { exclude: listed.filter((entry) => !entry.startsWith('.')).flatMap((entry) => [entry, `${entry}/client`]) } }
    },
    resolveId: (source) => source === 'virtual:damvia-modules' ? id : undefined,
    load: (loaded) => loaded !== id ? undefined : [
      ...entries.map((entry, index) => `import module${index} from ${JSON.stringify(entry)}`),
      `export default [${entries.map((_, index) => `module${index}`).join(', ')}]`,
    ].join('\n'),
    async transform(code, file) {
      if (!entries.length || !file.split('?')[0].endsWith('/src/style.css')) return
      const folders = await Promise.all(entries.map(async (entry) => dirname((await this.resolve(entry))?.id ?? entry)))
      return `${code}\n${folders.map((folder) => `@source ${JSON.stringify(folder)};`).join('\n')}`
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [damviaModules(), tailwind(), vue(), vueJsx(), svgLoader()],
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  resolve: {
    dedupe: ['vue', 'zod', '@internationalized/date'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

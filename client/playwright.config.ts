import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export default defineConfig({
  testDir: './test/ui',
  outputDir: join(tmpdir(), 'damvia-ui-results'),
  use: { baseURL: 'http://127.0.0.1:5176', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5176 --strictPort', url: 'http://127.0.0.1:5176/design-system.html', reuseExistingServer: false },
})

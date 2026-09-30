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
import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ci = !!process.env.CI

export default defineConfig({
  testDir: './test/ui',
  outputDir: join(tmpdir(), 'damvia-ui-results'),
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5176',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  // modules.spec.ts runs against a second client built with the hello module
  // of test/fixtures; every other spec sees the client as shipped.
  projects: [
    { name: 'core', testIgnore: /modules\.spec\.ts/ },
    { name: 'modules', testMatch: /modules\.spec\.ts/, use: { baseURL: 'http://127.0.0.1:5177' } },
  ],
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1 --port 5176 --strictPort', url: 'http://127.0.0.1:5176/design-system.html', reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5177 --strictPort', env: { DAMVIA_MODULES: './test/fixtures/module-hello' }, url: 'http://127.0.0.1:5177/design-system.html', reuseExistingServer: false },
  ],
})

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
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'

// Loaded first by env.ts so every module sees the .env values. `quiet` stops
// dotenv 17+ from printing a banner on each boot and inside the test runner.
config({ quiet: true })

// Any variable can come from a file instead, as Docker and Kubernetes secrets
// are mounted: FOO_FILE=/run/secrets/foo sets FOO to the file's contents
// without its trailing newline. A value set directly wins.
export function loadFileVariables(environment: NodeJS.ProcessEnv, read = (path: string) => readFileSync(path, 'utf8')) {
	for (const [name, path] of Object.entries(environment)) {
		if (!name.endsWith('_FILE') || !path) continue
		const target = name.slice(0, -'_FILE'.length)
		if (environment[target] !== undefined && environment[target] !== '') continue
		environment[target] = read(path).replace(/\r?\n$/, '')
	}
}

loadFileVariables(process.env)

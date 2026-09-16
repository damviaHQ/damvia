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
import { fileURLToPath } from 'node:url';
import { checkSource, checkHtml } from './docs-lib.mjs';
const result = process.argv[2] === '--html'
  ? checkHtml(process.argv[3], process.argv[4] ?? 'https://damvia.com')
  : checkSource(fileURLToPath(new URL('../', import.meta.url)));
console.log(JSON.stringify(result, null, 2));
if (result.errors.length) process.exitCode = 1;

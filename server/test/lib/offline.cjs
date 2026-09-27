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
// Loads the compiled configuration without a database, for tests of pure
// functions that live in modules importing env.
process.env.DOTENV_CONFIG_PATH = '/dev/null'
process.env.APP_SECRET = 'pure-tests-only-random-fixture-secret-20260919'
process.env.MAILCONFIG = Buffer.from('{}').toString('base64')
module.exports = require('../../dist/env')

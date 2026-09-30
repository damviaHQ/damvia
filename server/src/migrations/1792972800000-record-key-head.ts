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
import { MigrationInterface, QueryRunner } from 'typeorm'

// Keys built from parts, such as 18875-554-M, start with the model. Records
// whose key starts with the same part are looked up to suggest the values a
// record is missing, so that first part gets an index.
export class RecordKeyHead1792972800000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE FUNCTION damvia_key_head(key text) RETURNS text
				IMMUTABLE PARALLEL SAFE LANGUAGE sql
			AS $$ SELECT substring(key from '^[^-_./ ]+') $$
		`)
		await queryRunner.query(`CREATE INDEX idx_records_key_head ON records (damvia_key_head(record_key))`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS idx_records_key_head`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS damvia_key_head(text)`)
	}
}

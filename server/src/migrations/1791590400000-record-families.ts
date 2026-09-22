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

// Several products are often the same model: one style in three colours, one
// flavour in two formats. An administrator names the field that holds the
// model, and products sharing its value form a family. The value is matched on
// a normalised key, so "Pampa", " pampa " and "PAMPÁ" are one family.
export class RecordFamilies1791590400000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// unaccent is an extension a self-host may not have, and it is only
		// STABLE, so it cannot be indexed. This does the same for Latin text.
		await queryRunner.query(`
			CREATE FUNCTION damvia_family_key(value text) RETURNS text
				IMMUTABLE PARALLEL SAFE LANGUAGE sql
			AS $$
				SELECT nullif(lower(translate(
					btrim(regexp_replace(coalesce(value, ''), '\\s+', ' ', 'g')),
					'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
					'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy'
				)), '')
			$$
		`)
		await queryRunner.query(`
			ALTER TABLE enrichment_settings
				ADD COLUMN family_attribute_name varchar,
				ADD COLUMN family_axis_attribute_names text[] NOT NULL DEFAULT '{}'
		`)
		await queryRunner.query(`ALTER TABLE records ADD COLUMN family_key text, ADD COLUMN family_label text`)
		await queryRunner.query(`CREATE INDEX idx_records_family ON records (family_key)`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS idx_records_family`)
		await queryRunner.query(`ALTER TABLE records DROP COLUMN family_key, DROP COLUMN family_label`)
		await queryRunner.query(`
			ALTER TABLE enrichment_settings
				DROP COLUMN family_attribute_name,
				DROP COLUMN family_axis_attribute_names
		`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS damvia_family_key(text)`)
	}
}

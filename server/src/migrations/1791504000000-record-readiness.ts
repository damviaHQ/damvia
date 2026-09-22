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

// What makes a product ready to be used: the fields it must carry and the
// views it must have. The score is kept on the record so the catalogue can
// filter, sort and count on it. Nothing is required until an administrator
// says so, and every record then reads as ready.
export class RecordReadiness1791504000000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE readiness_definitions (
				id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
				table_id uuid UNIQUE REFERENCES record_tables(id) ON DELETE CASCADE,
				required_attribute_ids uuid[] NOT NULL DEFAULT '{}',
				required_views text[] NOT NULL DEFAULT '{}',
				ready_label varchar NOT NULL DEFAULT 'Ready to use',
				incomplete_label varchar NOT NULL DEFAULT 'To complete',
				created_at timestamp NOT NULL DEFAULT now(),
				updated_at timestamp NOT NULL DEFAULT now()
			)
		`)
		await queryRunner.query(`
			ALTER TABLE records
				ADD COLUMN readiness_filled integer NOT NULL DEFAULT 0,
				ADD COLUMN readiness_total integer NOT NULL DEFAULT 0,
				ADD COLUMN readiness_ready boolean NOT NULL DEFAULT true
		`)
		await queryRunner.query(`CREATE INDEX idx_records_readiness ON records (readiness_ready, table_id)`)
		await queryRunner.query(`ALTER TABLE enrichment_settings ADD COLUMN hide_records_without_media boolean NOT NULL DEFAULT false`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE enrichment_settings DROP COLUMN hide_records_without_media`)
		await queryRunner.query(`DROP INDEX IF EXISTS idx_records_readiness`)
		await queryRunner.query(`
			ALTER TABLE records
				DROP COLUMN readiness_filled,
				DROP COLUMN readiness_total,
				DROP COLUMN readiness_ready
		`)
		await queryRunner.query(`DROP TABLE readiness_definitions`)
	}
}

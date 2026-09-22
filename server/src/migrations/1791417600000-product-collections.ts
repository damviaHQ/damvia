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

// A collection holds records as well as files, so readers can browse products
// instead of folders. Membership is either chosen by hand or written by the
// rules the collection carries; one collection can stand for the whole
// catalogue. Existing collections keep holding files only.
export class ProductCollections1791417600000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE collection_records (
				collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
				record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
				source varchar NOT NULL DEFAULT 'manual',
				position integer NOT NULL DEFAULT 0,
				created_at timestamp NOT NULL DEFAULT now(),
				PRIMARY KEY (collection_id, record_id)
			)
		`)
		await queryRunner.query(`CREATE INDEX idx_collection_records_record ON collection_records (record_id)`)
		await queryRunner.query(`CREATE INDEX idx_collection_records_source ON collection_records (collection_id, source)`)
		await queryRunner.query(`
			ALTER TABLE collections
				ADD COLUMN record_filters jsonb,
				ADD COLUMN record_table_id uuid REFERENCES record_tables(id) ON DELETE SET NULL,
				ADD COLUMN includes_all_records boolean NOT NULL DEFAULT false,
				ADD COLUMN number_of_records integer NOT NULL DEFAULT 0,
				ADD COLUMN catalogue_mode varchar NOT NULL DEFAULT 'files'
		`)
		// The count climbs the ancestors of the collection, exactly as the
		// number_of_files triggers do.
		await queryRunner.query(`
			CREATE FUNCTION refresh_collection_number_of_records_on_insert() RETURNS trigger
				LANGUAGE plpgsql
			AS $$
			BEGIN
				UPDATE collections
				SET number_of_records = coalesce(number_of_records, 0) + 1
				WHERE id::text = ANY(
					SELECT unnest(string_to_array(current.mpath, '.'))
					FROM collections current
					WHERE current.id = NEW.collection_id
				);
				RETURN NEW;
			END;
			$$
		`)
		await queryRunner.query(`
			CREATE FUNCTION refresh_collection_number_of_records_on_delete() RETURNS trigger
				LANGUAGE plpgsql
			AS $$
			BEGIN
				UPDATE collections
				SET number_of_records = greatest(coalesce(number_of_records, 0) - 1, 0)
				WHERE id::text = ANY(
					SELECT unnest(string_to_array(current.mpath, '.'))
					FROM collections current
					WHERE current.id = OLD.collection_id
				);
				RETURN OLD;
			END;
			$$
		`)
		await queryRunner.query(`
			CREATE TRIGGER refresh_collection_number_of_records_on_insert
				AFTER INSERT ON collection_records
				FOR EACH ROW
				EXECUTE PROCEDURE refresh_collection_number_of_records_on_insert()
		`)
		await queryRunner.query(`
			CREATE TRIGGER refresh_collection_number_of_records_on_delete
				AFTER DELETE ON collection_records
				FOR EACH ROW
				EXECUTE PROCEDURE refresh_collection_number_of_records_on_delete()
		`)
		// Catalogue filters read one hstore key at a time.
		await queryRunner.query(`CREATE INDEX idx_records_meta_data ON records USING gin (meta_data)`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS idx_records_meta_data`)
		await queryRunner.query(`DROP TRIGGER IF EXISTS refresh_collection_number_of_records_on_delete ON collection_records`)
		await queryRunner.query(`DROP TRIGGER IF EXISTS refresh_collection_number_of_records_on_insert ON collection_records`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS refresh_collection_number_of_records_on_delete`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS refresh_collection_number_of_records_on_insert`)
		await queryRunner.query(`
			ALTER TABLE collections
				DROP COLUMN record_filters,
				DROP COLUMN record_table_id,
				DROP COLUMN includes_all_records,
				DROP COLUMN number_of_records,
				DROP COLUMN catalogue_mode
		`)
		await queryRunner.query(`DROP TABLE collection_records`)
	}
}

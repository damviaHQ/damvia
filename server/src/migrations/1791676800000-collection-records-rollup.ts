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

// Membership is written in bulk: a rule matching twenty thousand products
// wrote twenty thousand rows and fired the count trigger once per row, which
// measured five seconds. The count is now kept once per statement, over the
// rows the statement touched, which measures a tenth of a second.
export class CollectionRecordsRollup1791676800000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TRIGGER IF EXISTS refresh_collection_number_of_records_on_insert ON collection_records`)
		await queryRunner.query(`DROP TRIGGER IF EXISTS refresh_collection_number_of_records_on_delete ON collection_records`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS refresh_collection_number_of_records_on_insert`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS refresh_collection_number_of_records_on_delete`)
		await queryRunner.query(`
			CREATE FUNCTION refresh_collection_number_of_records_on_insert() RETURNS trigger
				LANGUAGE plpgsql
			AS $$
			BEGIN
				UPDATE collections c
				SET number_of_records = coalesce(c.number_of_records, 0) + counts.n
				FROM (
					SELECT ancestor.id::uuid AS id, count(*) AS n
					FROM inserted
					INNER JOIN collections d ON d.id = inserted.collection_id
					CROSS JOIN unnest(string_to_array(d.mpath, '.')) AS ancestor(id)
					WHERE ancestor.id <> ''
					GROUP BY 1
				) counts
				WHERE counts.id = c.id;
				RETURN NULL;
			END;
			$$
		`)
		await queryRunner.query(`
			CREATE FUNCTION refresh_collection_number_of_records_on_delete() RETURNS trigger
				LANGUAGE plpgsql
			AS $$
			BEGIN
				UPDATE collections c
				SET number_of_records = greatest(coalesce(c.number_of_records, 0) - counts.n, 0)
				FROM (
					SELECT ancestor.id::uuid AS id, count(*) AS n
					FROM removed
					INNER JOIN collections d ON d.id = removed.collection_id
					CROSS JOIN unnest(string_to_array(d.mpath, '.')) AS ancestor(id)
					WHERE ancestor.id <> ''
					GROUP BY 1
				) counts
				WHERE counts.id = c.id;
				RETURN NULL;
			END;
			$$
		`)
		await queryRunner.query(`
			CREATE TRIGGER refresh_collection_number_of_records_on_insert
				AFTER INSERT ON collection_records
				REFERENCING NEW TABLE AS inserted
				FOR EACH STATEMENT
				EXECUTE PROCEDURE refresh_collection_number_of_records_on_insert()
		`)
		// A collection dropped takes its rows with it, and its own row is gone
		// by the time the statement trigger runs, so the join simply finds
		// nothing for it.
		await queryRunner.query(`
			CREATE TRIGGER refresh_collection_number_of_records_on_delete
				AFTER DELETE ON collection_records
				REFERENCING OLD TABLE AS removed
				FOR EACH STATEMENT
				EXECUTE PROCEDURE refresh_collection_number_of_records_on_delete()
		`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TRIGGER IF EXISTS refresh_collection_number_of_records_on_insert ON collection_records`)
		await queryRunner.query(`DROP TRIGGER IF EXISTS refresh_collection_number_of_records_on_delete ON collection_records`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS refresh_collection_number_of_records_on_insert`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS refresh_collection_number_of_records_on_delete`)
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
	}
}

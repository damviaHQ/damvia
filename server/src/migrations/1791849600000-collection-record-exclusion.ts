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

// Taking a product out of a catalogue cannot be a deletion: the rules of a
// dynamic collection would put it back at the next pass. It is a flag the
// builder sets, and the count readers see follows it.
export class CollectionRecordExclusion1791849600000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE collection_records ADD COLUMN excluded boolean NOT NULL DEFAULT false`)
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION refresh_collection_number_of_records_on_insert() RETURNS trigger
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
					WHERE ancestor.id <> '' AND NOT inserted.excluded
					GROUP BY 1
				) counts
				WHERE counts.id = c.id;
				RETURN NULL;
			END;
			$$
		`)
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION refresh_collection_number_of_records_on_delete() RETURNS trigger
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
					WHERE ancestor.id <> '' AND NOT removed.excluded
					GROUP BY 1
				) counts
				WHERE counts.id = c.id;
				RETURN NULL;
			END;
			$$
		`)
		// Excluding and including again move the count without a row being
		// written or dropped, so the rollup needs its own statement trigger.
		// Postgres refuses transition tables on a trigger with a column list,
		// so it fires on any update and the delta is zero unless the flag moved.
		await queryRunner.query(`
			CREATE FUNCTION refresh_collection_number_of_records_on_exclude() RETURNS trigger
				LANGUAGE plpgsql
			AS $$
			BEGIN
				UPDATE collections c
				SET number_of_records = greatest(coalesce(c.number_of_records, 0) + counts.n, 0)
				FROM (
					SELECT ancestor.id::uuid AS id, sum(changed.delta) AS n
					FROM (
						SELECT i.collection_id,
							CASE WHEN o.excluded AND NOT i.excluded THEN 1 WHEN NOT o.excluded AND i.excluded THEN -1 ELSE 0 END AS delta
						FROM inserted i
						INNER JOIN removed o ON o.collection_id = i.collection_id AND o.record_id = i.record_id
					) changed
					INNER JOIN collections d ON d.id = changed.collection_id
					CROSS JOIN unnest(string_to_array(d.mpath, '.')) AS ancestor(id)
					WHERE ancestor.id <> '' AND changed.delta <> 0
					GROUP BY 1
				) counts
				WHERE counts.id = c.id;
				RETURN NULL;
			END;
			$$
		`)
		await queryRunner.query(`
			CREATE TRIGGER refresh_collection_number_of_records_on_exclude
				AFTER UPDATE ON collection_records
				REFERENCING OLD TABLE AS removed NEW TABLE AS inserted
				FOR EACH STATEMENT
				EXECUTE PROCEDURE refresh_collection_number_of_records_on_exclude()
		`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TRIGGER IF EXISTS refresh_collection_number_of_records_on_exclude ON collection_records`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS refresh_collection_number_of_records_on_exclude`)
		// The counts go back to every membership row, so the products taken out
		// of a catalogue are counted again.
		await queryRunner.query(`
			UPDATE collections c
			SET number_of_records = coalesce(counts.n, 0)
			FROM (
				SELECT ancestor.id::uuid AS id, count(*) AS n
				FROM collection_records cr
				INNER JOIN collections d ON d.id = cr.collection_id
				CROSS JOIN unnest(string_to_array(d.mpath, '.')) AS ancestor(id)
				WHERE ancestor.id <> ''
				GROUP BY 1
			) counts
			WHERE counts.id = c.id
		`)
		await queryRunner.query(`ALTER TABLE collection_records DROP COLUMN excluded`)
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION refresh_collection_number_of_records_on_insert() RETURNS trigger
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
			CREATE OR REPLACE FUNCTION refresh_collection_number_of_records_on_delete() RETURNS trigger
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
	}
}

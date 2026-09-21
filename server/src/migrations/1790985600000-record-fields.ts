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

// Record fields get a type, options for selects and an order, and every key
// already present in the catalogue becomes a declared field. Each change to a
// record leaves a row in record_changes, kept for good.
export class RecordFields1790985600000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE record_attributes
                ADD COLUMN value_type varchar NOT NULL DEFAULT 'text',
                ADD COLUMN options text[] NOT NULL DEFAULT '{}',
                ADD COLUMN position int NOT NULL DEFAULT 0;

            WITH keys AS (
                SELECT k.name, min(r.created_at) AS first_seen, min(k.ord) AS ord
                FROM records r CROSS JOIN LATERAL unnest(akeys(r.meta_data)) WITH ORDINALITY AS k(name, ord)
                WHERE k.name <> r.key_column_name
                GROUP BY k.name
            ), ordered AS (
                SELECT name, (row_number() OVER (ORDER BY first_seen, ord, name) - 1)::int AS position FROM keys
            )
            INSERT INTO record_attributes (name, value_type, position)
            SELECT name, 'text', position FROM ordered
            ON CONFLICT (name) DO UPDATE SET position = EXCLUDED.position;

            UPDATE record_attributes a SET position = o.position
            FROM (SELECT id, (row_number() OVER (ORDER BY position, name) - 1)::int AS position FROM record_attributes) o
            WHERE o.id = a.id;

            CREATE TABLE record_changes (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                record_id uuid REFERENCES records ON DELETE SET NULL,
                record_key text NOT NULL,
                action varchar NOT NULL,
                source varchar NOT NULL,
                changes jsonb NOT NULL DEFAULT '{}',
                changed_by_id uuid REFERENCES users ON DELETE SET NULL,
                import_batch_id uuid,
                created_at timestamp NOT NULL DEFAULT now()
            );
            CREATE INDEX idx_record_changes_record ON record_changes (record_id, created_at DESC);
            CREATE INDEX idx_record_changes_batch ON record_changes (import_batch_id) WHERE import_batch_id IS NOT NULL;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE record_changes;
            ALTER TABLE record_attributes DROP COLUMN value_type, DROP COLUMN options, DROP COLUMN position;
        `)
    }
}

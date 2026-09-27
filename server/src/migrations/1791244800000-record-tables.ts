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

// Records are organised in tables, like the sheets of a workbook. Fields stay
// shared by the whole catalogue; each table picks the fields it shows. Every
// existing record and field goes to a first table named after the records.
// A record inserted without a table lands in the first one.
export class RecordTables1791244800000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE record_tables (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                name varchar NOT NULL UNIQUE,
                position int NOT NULL DEFAULT 0,
                created_at timestamp NOT NULL DEFAULT now(),
                updated_at timestamp NOT NULL DEFAULT now()
            );
            CREATE TABLE record_table_attributes (
                table_id uuid NOT NULL REFERENCES record_tables ON DELETE CASCADE,
                attribute_id uuid NOT NULL REFERENCES record_attributes ON DELETE CASCADE,
                position int NOT NULL DEFAULT 0,
                PRIMARY KEY (table_id, attribute_id)
            );
            CREATE INDEX idx_record_table_attributes_attribute ON record_table_attributes (attribute_id);

            INSERT INTO record_tables (name, position)
            SELECT coalesce((SELECT NULLIF(trim(record_label_plural), '') FROM enrichment_settings WHERE id = 1), 'Records'), 0;
            INSERT INTO record_table_attributes (table_id, attribute_id, position)
            SELECT t.id, a.id, (row_number() OVER (ORDER BY a.position, a.name) - 1)::int
            FROM record_attributes a CROSS JOIN record_tables t;

            ALTER TABLE records ADD COLUMN table_id uuid REFERENCES record_tables ON DELETE RESTRICT;
            UPDATE records SET table_id = (SELECT id FROM record_tables LIMIT 1);
            ALTER TABLE records ALTER COLUMN table_id SET NOT NULL;
            CREATE INDEX idx_records_table ON records (table_id, created_at);

            CREATE FUNCTION records_default_table() RETURNS trigger AS $$
            BEGIN
                IF NEW.table_id IS NULL THEN
                    SELECT id INTO NEW.table_id FROM record_tables ORDER BY position, created_at, id LIMIT 1;
                    IF NEW.table_id IS NULL THEN
                        INSERT INTO record_tables (name) VALUES ('Records') RETURNING id INTO NEW.table_id;
                    END IF;
                END IF;
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            CREATE TRIGGER records_default_table BEFORE INSERT ON records FOR EACH ROW EXECUTE FUNCTION records_default_table();
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TRIGGER records_default_table ON records;
            DROP FUNCTION records_default_table();
            ALTER TABLE records DROP COLUMN table_id;
            DROP TABLE record_table_attributes;
            DROP TABLE record_tables;
        `)
    }
}

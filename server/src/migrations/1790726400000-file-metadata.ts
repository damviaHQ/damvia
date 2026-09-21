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

// Metadata written inside files (EXIF, IPTC) becomes fields an admin can make
// searchable, facetable, viewable or trusted to link a file to a record. A
// field is created switched off the first time a file carries it. CSV
// mappings link files to records by name when nothing in the file says so.
export class FileMetadata1790726400000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE metadata_fields (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                name text NOT NULL UNIQUE,
                display_name text,
                value_type varchar NOT NULL,
                searchable boolean NOT NULL DEFAULT false,
                facetable boolean NOT NULL DEFAULT false,
                viewable boolean NOT NULL DEFAULT false,
                can_link boolean NOT NULL DEFAULT false,
                link_target varchar,
                link_attribute_name text,
                file_count int NOT NULL DEFAULT 0,
                created_at timestamp NOT NULL DEFAULT now(),
                updated_at timestamp NOT NULL DEFAULT now()
            );
            CREATE TABLE asset_file_metadata_values (
                asset_file_id uuid NOT NULL REFERENCES asset_files ON DELETE CASCADE,
                metadata_field_id uuid NOT NULL REFERENCES metadata_fields ON DELETE CASCADE,
                value_text text NOT NULL,
                value_date timestamp,
                value_number double precision,
                PRIMARY KEY (asset_file_id, metadata_field_id, value_text)
            );
            CREATE INDEX idx_metadata_values_field_value ON asset_file_metadata_values (metadata_field_id, value_text);
            CREATE INDEX idx_metadata_values_field_date ON asset_file_metadata_values (metadata_field_id, value_date);
            CREATE TABLE asset_entity_csv_mappings (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                import_batch_id uuid NOT NULL,
                file_name text NOT NULL,
                target_kind varchar NOT NULL,
                record_key text,
                attribute_name text,
                attribute_value text,
                created_by_id uuid REFERENCES users ON DELETE SET NULL,
                created_at timestamp NOT NULL DEFAULT now()
            );
            CREATE INDEX idx_csv_mappings_file_name ON asset_entity_csv_mappings (lower(file_name));
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE asset_entity_csv_mappings;
            DROP TABLE asset_file_metadata_values;
            DROP TABLE metadata_fields;
        `)
    }
}

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

// A file links to zero, one or many records, or to a range of records through
// an attribute value, and each link says which strategy made it. The old
// single record_id stays as the derived primary so nothing that reads it
// changes. Matching strategies are ordered steps per asset type; the product
// regex from the environment becomes the first step of every type related to
// records.
export class EntityLinks1790640000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE asset_type_resolver_steps (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                asset_type_id uuid NOT NULL REFERENCES asset_types ON DELETE CASCADE,
                position int NOT NULL,
                strategy varchar NOT NULL,
                config jsonb NOT NULL DEFAULT '{}',
                enabled boolean NOT NULL DEFAULT true,
                last_error text,
                created_at timestamp NOT NULL DEFAULT now(),
                updated_at timestamp NOT NULL DEFAULT now()
            );
            CREATE INDEX idx_resolver_steps_asset_type ON asset_type_resolver_steps (asset_type_id, position);

            CREATE TABLE asset_entity_links (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                asset_file_id uuid NOT NULL REFERENCES asset_files ON DELETE CASCADE,
                target_kind varchar NOT NULL,
                record_id uuid REFERENCES records ON DELETE SET NULL,
                record_key text,
                attribute_name text,
                attribute_value text,
                strategy varchar NOT NULL,
                resolver_step_id uuid REFERENCES asset_type_resolver_steps ON DELETE SET NULL,
                source_folder_id uuid REFERENCES asset_folders ON DELETE CASCADE,
                is_primary boolean NOT NULL DEFAULT false,
                status varchar NOT NULL DEFAULT 'active',
                created_by_id uuid REFERENCES users ON DELETE SET NULL,
                created_at timestamp NOT NULL DEFAULT now(),
                updated_at timestamp NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX uq_asset_entity_links ON asset_entity_links
                (asset_file_id, target_kind, coalesce(record_key, ''), coalesce(attribute_name, ''), coalesce(attribute_value, ''), strategy);
            CREATE INDEX idx_asset_entity_links_record ON asset_entity_links (record_id);
            CREATE INDEX idx_asset_entity_links_attribute ON asset_entity_links (attribute_name, attribute_value);

            CREATE TABLE asset_file_resolutions (
                asset_file_id uuid PRIMARY KEY REFERENCES asset_files ON DELETE CASCADE,
                status varchar NOT NULL,
                candidates jsonb NOT NULL DEFAULT '[]',
                reason text,
                resolved_at timestamp NOT NULL DEFAULT now()
            );
            CREATE INDEX idx_asset_file_resolutions_status ON asset_file_resolutions (status);

            CREATE TABLE asset_folder_entity_attachments (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                asset_folder_id uuid NOT NULL REFERENCES asset_folders ON DELETE CASCADE,
                target_kind varchar NOT NULL,
                record_id uuid REFERENCES records ON DELETE SET NULL,
                record_key text,
                attribute_name text,
                attribute_value text,
                created_by_id uuid REFERENCES users ON DELETE SET NULL,
                created_at timestamp NOT NULL DEFAULT now(),
                updated_at timestamp NOT NULL DEFAULT now()
            );
            CREATE INDEX idx_folder_attachments_folder ON asset_folder_entity_attachments (asset_folder_id);

            ALTER TABLE enrichment_settings
                ADD COLUMN views_enabled boolean NOT NULL DEFAULT false,
                ADD COLUMN view_separator varchar NOT NULL DEFAULT '.',
                ADD COLUMN view_digits int NOT NULL DEFAULT 2,
                ADD COLUMN thumbnail_view varchar NOT NULL DEFAULT '00';
        `)
        if (process.env.PIM_PRODUCT_VIEW) {
            await queryRunner.query('UPDATE enrichment_settings SET thumbnail_view = $1', [process.env.PIM_PRODUCT_VIEW])
        }
        if (process.env.PIM_PRODUCT_VIEW || process.env.PRODUCT_MATCHING_REGEX) {
            await queryRunner.query('UPDATE enrichment_settings SET views_enabled = true')
        }
        // The links the old cron made on files of record-related types become
        // filename links, so the first pass finds them in place. Files of other
        // types keep their record_id, still owned by the old cron.
        await queryRunner.query(`
            INSERT INTO asset_entity_links (asset_file_id, target_kind, record_id, record_key, strategy, is_primary)
            SELECT f.id, 'record', r.id, r.record_key, 'filename_regex', true
            FROM asset_files f INNER JOIN records r ON r.id = f.record_id INNER JOIN asset_types t ON t.id = f.asset_type_id
            WHERE t.is_related_to_records;
        `)
        const pattern = process.env.PRODUCT_MATCHING_REGEX
        if (pattern) {
            await queryRunner.query(`
                INSERT INTO asset_type_resolver_steps (asset_type_id, position, strategy, config)
                SELECT t.id, 0, 'filename_regex', jsonb_build_object('pattern', $1::text, 'keyGroup', 1, 'viewGroup', 2)
                FROM asset_types t
                WHERE t.is_related_to_records AND NOT EXISTS (SELECT 1 FROM asset_type_resolver_steps s WHERE s.asset_type_id = t.id);
            `, [pattern])
            await queryRunner.query(`
                UPDATE asset_entity_links l SET resolver_step_id = s.id
                FROM asset_files f, asset_type_resolver_steps s
                WHERE l.asset_file_id = f.id AND s.asset_type_id = f.asset_type_id AND s.strategy = 'filename_regex';
            `)
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE enrichment_settings DROP COLUMN views_enabled, DROP COLUMN view_separator, DROP COLUMN view_digits, DROP COLUMN thumbnail_view;
            DROP TABLE asset_folder_entity_attachments;
            DROP TABLE asset_file_resolutions;
            DROP TABLE asset_entity_links;
            DROP TABLE asset_type_resolver_steps;
        `)
    }
}

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

// Files of one folder and asset type that share a name and differ only by
// format, language or duration are grouped into one card. What differs
// between them is stored as axes, which an admin names and which become
// search filters. Admin overrides are kept by file id so they survive syncs.
export class VariantGroups1790812800000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE asset_types ADD COLUMN group_variants boolean NOT NULL DEFAULT false;

            CREATE TABLE variant_groups (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                asset_folder_id uuid NOT NULL REFERENCES asset_folders ON DELETE CASCADE,
                asset_type_id uuid NOT NULL REFERENCES asset_types ON DELETE CASCADE,
                prefix_key text NOT NULL,
                display_name text NOT NULL,
                cover_asset_file_id uuid REFERENCES asset_files ON DELETE SET NULL,
                member_count int NOT NULL,
                created_at timestamp NOT NULL DEFAULT now(),
                updated_at timestamp NOT NULL DEFAULT now(),
                UNIQUE (asset_folder_id, asset_type_id, prefix_key)
            );
            CREATE TABLE variant_group_members (
                asset_file_id uuid PRIMARY KEY REFERENCES asset_files ON DELETE CASCADE,
                variant_group_id uuid NOT NULL REFERENCES variant_groups ON DELETE CASCADE,
                axis_values text[] NOT NULL
            );
            CREATE INDEX idx_variant_group_members_group ON variant_group_members (variant_group_id);

            CREATE TABLE variant_axes (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                name text,
                "values" text[] NOT NULL,
                recognizer varchar,
                ignored boolean NOT NULL DEFAULT false,
                example_file_names text[] NOT NULL DEFAULT '{}',
                created_at timestamp NOT NULL DEFAULT now(),
                updated_at timestamp NOT NULL DEFAULT now()
            );
            CREATE TABLE variant_group_axes (
                variant_group_id uuid NOT NULL REFERENCES variant_groups ON DELETE CASCADE,
                position int NOT NULL,
                variant_axis_id uuid NOT NULL REFERENCES variant_axes ON DELETE CASCADE,
                PRIMARY KEY (variant_group_id, position)
            );
            CREATE INDEX idx_variant_group_axes_axis ON variant_group_axes (variant_axis_id);

            CREATE TABLE variant_group_overrides (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                kind varchar NOT NULL,
                asset_file_ids uuid[] NOT NULL,
                created_by_id uuid REFERENCES users ON DELETE SET NULL,
                created_at timestamp NOT NULL DEFAULT now()
            );

            CREATE TABLE variant_grouping_settings (
                id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                min_prefix_length int NOT NULL DEFAULT 4,
                blocked_tokens text[] NOT NULL DEFAULT '{v2,v3,final,ok,old,new,copy,img,dsc}',
                updated_at timestamp NOT NULL DEFAULT now()
            );
            INSERT INTO variant_grouping_settings DEFAULT VALUES;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE variant_grouping_settings;
            DROP TABLE variant_group_overrides;
            DROP TABLE variant_group_axes;
            DROP TABLE variant_axes;
            DROP TABLE variant_group_members;
            DROP TABLE variant_groups;
            ALTER TABLE asset_types DROP COLUMN group_variants;
        `)
    }
}

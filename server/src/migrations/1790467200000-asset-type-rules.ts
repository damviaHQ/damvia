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

// Asset types can be given by a regex on the folder path. A folder records
// where its type came from so a hand-set type survives every pass. Existing
// folders whose type differs from their parent's are taken as set by hand.
export class AssetTypeRules1790467200000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE asset_type_rules (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                pattern text NOT NULL,
                asset_type_id uuid NOT NULL REFERENCES asset_types ON DELETE CASCADE,
                enabled boolean NOT NULL DEFAULT true,
                last_error text,
                created_by_id uuid REFERENCES users ON DELETE SET NULL,
                created_at timestamp NOT NULL DEFAULT now(),
                updated_at timestamp NOT NULL DEFAULT now()
            );
            ALTER TABLE asset_folders
                ADD COLUMN asset_type_source varchar,
                ADD COLUMN asset_type_rule_id uuid REFERENCES asset_type_rules ON DELETE SET NULL;
        `)
        await queryRunner.query(`
            UPDATE asset_folders f SET asset_type_source = CASE
                WHEN f.asset_type_id IS NULL THEN NULL
                WHEN f.parent_id IS NULL THEN 'manual'
                WHEN f.asset_type_id IS DISTINCT FROM (SELECT p.asset_type_id FROM asset_folders p WHERE p.id = f.parent_id) THEN 'manual'
                ELSE 'inherited' END;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE asset_folders
                DROP COLUMN asset_type_rule_id,
                DROP COLUMN asset_type_source;
            DROP TABLE asset_type_rules;
        `)
    }
}

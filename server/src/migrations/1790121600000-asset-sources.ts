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

export class AssetSources1790121600000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE asset_folders ADD COLUMN source_key varchar NOT NULL DEFAULT '';
            ALTER TABLE asset_files ADD COLUMN source_key varchar NOT NULL DEFAULT '';
            ALTER TABLE asset_folders DROP CONSTRAINT "UQ_d1bbe796866f2b68f2061fa2d6d";
            ALTER TABLE asset_files DROP CONSTRAINT "UQ_bead8e0de20330fa86534a1c6ab";
            CREATE UNIQUE INDEX idx_asset_folders_source_external ON asset_folders (source_key, external_id);
            CREATE UNIQUE INDEX idx_asset_files_source_external ON asset_files (source_key, external_id);
            CREATE TABLE asset_sources (
                key varchar PRIMARY KEY,
                provider varchar NOT NULL,
                label varchar,
                root varchar NOT NULL,
                last_run_started_at timestamptz,
                last_run_finished_at timestamptz,
                last_success_at timestamptz,
                last_error text
            );
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE asset_sources;
            DROP INDEX idx_asset_files_source_external;
            DROP INDEX idx_asset_folders_source_external;
            ALTER TABLE asset_files ADD CONSTRAINT "UQ_bead8e0de20330fa86534a1c6ab" UNIQUE (external_id);
            ALTER TABLE asset_folders ADD CONSTRAINT "UQ_d1bbe796866f2b68f2061fa2d6d" UNIQUE (external_id);
            ALTER TABLE asset_files DROP COLUMN source_key;
            ALTER TABLE asset_folders DROP COLUMN source_key;
        `)
    }
}

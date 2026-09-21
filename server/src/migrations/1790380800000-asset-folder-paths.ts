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

// The human path of a folder ('/Root/Season/Packshots') only existed inside
// the cloud drivers. Folder rules match on it, so it is stored and refreshed
// after every sync by the enrichment pass.
export class AssetFolderPaths1790380800000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE asset_folders ADD COLUMN path text;
            CREATE INDEX idx_asset_folders_path ON asset_folders (path);
        `)
        await queryRunner.query(`
            WITH RECURSIVE tree AS (
                SELECT id, '/' || name AS path FROM asset_folders WHERE parent_id IS NULL
                UNION ALL
                SELECT f.id, tree.path || '/' || f.name FROM asset_folders f INNER JOIN tree ON f.parent_id = tree.id
            )
            UPDATE asset_folders f SET path = tree.path FROM tree WHERE f.id = tree.id;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX idx_asset_folders_path;
            ALTER TABLE asset_folders DROP COLUMN path;
        `)
    }
}

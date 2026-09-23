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

// Synchronized collections are identified by the folder they mirror, no longer
// by their name, so custom collections can live inside a synchronized tree and
// survive folder renames, moves and deletions. Rows that lose their synchronized
// parent are kept and flagged instead of deleted.
export class CollectionNesting1790294400000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE collections
                ADD COLUMN orphaned_at timestamp,
                ADD COLUMN orphaned_from_name varchar,
                ADD COLUMN orphaned_reason varchar;
            CREATE INDEX idx_collections_orphaned_at ON collections (orphaned_at) WHERE orphaned_at IS NOT NULL;
            ALTER TABLE collections DROP CONSTRAINT idx_parent_id_name;
        `)
        await queryRunner.query(`
            WITH RECURSIVE tree AS (
                SELECT id, id::text || '.' AS path FROM collections WHERE parent_id IS NULL
                UNION ALL
                SELECT c.id, tree.path || c.id::text || '.' FROM collections c INNER JOIN tree ON c.parent_id = tree.id
            )
            UPDATE collections c SET mpath = tree.path FROM tree WHERE tree.id = c.id AND c.mpath IS DISTINCT FROM tree.path;
        `)
        // The rename race could leave two rows mirroring one folder under the
        // same parent. The oldest one is kept and the others go, with the
        // synchronized rows under them (the next synchronization recreates
        // them under the kept one). Custom collections found anywhere under a
        // retired row move under the kept one: direct children silently, deeper
        // ones flagged, since their exact place is gone. The unique (parent_id,
        // name) constraint is already gone above: the kept row may hold a
        // custom collection with the same name as one that moves under it.
        await queryRunner.query(`
            CREATE TEMP TABLE duplicate_mirrors AS
            SELECT ranked.id, ranked.kept_id, c.mpath FROM (
                SELECT id, first_value(id) OVER (PARTITION BY parent_id, asset_folder_id ORDER BY created_at, id) AS kept_id
                FROM collections WHERE parent_id IS NOT NULL AND asset_folder_id IS NOT NULL
            ) ranked INNER JOIN collections c ON c.id = ranked.id WHERE ranked.id <> ranked.kept_id;
            UPDATE collections c SET parent_id = d.kept_id
            FROM duplicate_mirrors d WHERE c.parent_id = d.id AND c.asset_folder_id IS NULL;
            UPDATE collections c SET parent_id = d.kept_id, orphaned_at = now(), orphaned_reason = 'duplicate_mirror', orphaned_from_name = p.name
            FROM duplicate_mirrors d, collections p
            WHERE p.id = c.parent_id AND p.id <> d.id AND p.asset_folder_id IS NOT NULL AND c.asset_folder_id IS NULL AND p.mpath LIKE d.mpath || '%';
            DELETE FROM collections WHERE id IN (SELECT id FROM duplicate_mirrors);
            DROP TABLE duplicate_mirrors;
        `)
        await queryRunner.query(`
            WITH RECURSIVE tree AS (
                SELECT id, id::text || '.' AS path FROM collections WHERE parent_id IS NULL
                UNION ALL
                SELECT c.id, tree.path || c.id::text || '.' FROM collections c INNER JOIN tree ON c.parent_id = tree.id
            )
            UPDATE collections c SET mpath = tree.path FROM tree WHERE tree.id = c.id AND c.mpath IS DISTINCT FROM tree.path;
        `)
        await queryRunner.query(`
            WITH RECURSIVE tree AS (
                SELECT id, id::text || '.' AS path FROM menu_items WHERE parent_id IS NULL
                UNION ALL
                SELECT m.id, tree.path || m.id::text || '.' FROM menu_items m INNER JOIN tree ON m.parent_id = tree.id
            )
            UPDATE menu_items m SET mpath = tree.path FROM tree WHERE tree.id = m.id AND m.mpath IS DISTINCT FROM tree.path;
        `)
        // The counter triggers never followed path rewrites, so ancestors drifted.
        // Counted by walking each file's ancestor ids, as the triggers do: a
        // prefix match between every pair of collections would be quadratic.
        await queryRunner.query(`
            WITH counts AS (
                SELECT ancestor.id::uuid AS id, count(*) AS n
                FROM collection_files cf
                INNER JOIN collections d ON d.id = cf.collection_id
                CROSS JOIN unnest(string_to_array(d.mpath, '.')) AS ancestor(id)
                WHERE ancestor.id <> ''
                GROUP BY 1
            )
            UPDATE collections c SET number_of_files = coalesce(counts.n, 0)
            FROM (SELECT id FROM collections) all_ids
            LEFT JOIN counts ON counts.id = all_ids.id
            WHERE c.id = all_ids.id AND c.number_of_files <> coalesce(counts.n, 0);
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX idx_collections_parent_asset_folder ON collections (parent_id, asset_folder_id) WHERE asset_folder_id IS NOT NULL;
            CREATE INDEX idx_collections_mpath_pattern ON collections (mpath text_pattern_ops);
            CREATE INDEX idx_menu_items_mpath_pattern ON menu_items (mpath text_pattern_ops);
            CREATE INDEX idx_asset_folders_mpath_pattern ON asset_folders (mpath text_pattern_ops);
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX idx_asset_folders_mpath_pattern;
            DROP INDEX idx_menu_items_mpath_pattern;
            DROP INDEX idx_collections_mpath_pattern;
            DROP INDEX idx_collections_parent_asset_folder;
        `)
        // Siblings may share a name now; the old constraint needs them apart.
        await queryRunner.query(`
            WITH ranked AS (
                SELECT id, row_number() OVER (PARTITION BY parent_id, name ORDER BY created_at, id) AS n
                FROM collections WHERE parent_id IS NOT NULL
            )
            UPDATE collections c SET name = c.name || ' (' || ranked.n || ')' FROM ranked WHERE ranked.id = c.id AND ranked.n > 1;
            ALTER TABLE collections ADD CONSTRAINT idx_parent_id_name UNIQUE (parent_id, name);
        `)
        await queryRunner.query(`
            DROP INDEX idx_collections_orphaned_at;
            ALTER TABLE collections
                DROP COLUMN orphaned_at,
                DROP COLUMN orphaned_from_name,
                DROP COLUMN orphaned_reason;
        `)
    }
}

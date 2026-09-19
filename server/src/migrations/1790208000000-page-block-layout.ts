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

// Blocks stop being placed on a sparse row/column/width grid: they are an
// ordered list, each one full, half or third width. Their payload becomes jsonb
// with one documented shape per block type.
export class PageBlockLayout1790208000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE page_blocks
                ADD COLUMN position integer NOT NULL DEFAULT 0,
                ADD COLUMN size varchar NOT NULL DEFAULT 'full';
        `)
        // Reading order becomes the list order; a row's block count becomes the width.
        await queryRunner.query(`
            WITH ranked AS (
                SELECT id,
                    row_number() OVER (PARTITION BY page_id ORDER BY row, "column", created_at) - 1 AS position,
                    count(*) OVER (PARTITION BY page_id, row) AS row_count
                FROM page_blocks
            )
            UPDATE page_blocks b
            SET position = ranked.position,
                size = CASE ranked.row_count WHEN 2 THEN 'half' WHEN 3 THEN 'third' ELSE 'full' END
            FROM ranked WHERE ranked.id = b.id;
        `)
        await queryRunner.query(`
            ALTER TABLE page_blocks
                ALTER COLUMN data TYPE jsonb
                USING CASE WHEN data IS NULL OR data = '' THEN NULL ELSE data::jsonb END;
        `)
        // Text was stored as a bare HTML string, and older rows as { content }.
        await queryRunner.query(`
            UPDATE page_blocks SET data = jsonb_build_object('html', CASE
                WHEN jsonb_typeof(data) = 'string' THEN data #>> '{}'
                WHEN jsonb_typeof(data) = 'object' THEN coalesce(data ->> 'content', '')
                ELSE '' END)
            WHERE type = 'text';
        `)
        await queryRunner.query(`
            UPDATE page_blocks SET data = jsonb_build_object(
                'media', CASE WHEN data ? 's3key' THEN jsonb_build_object('source', 'upload', 's3key', data -> 's3key') END,
                'alt', '',
                'caption', '',
                'link', CASE WHEN coalesce(data ->> 'url', '') <> '' THEN jsonb_build_object(
                    'kind', 'url', 'url', data -> 'url', 'external', coalesce((data ->> 'external')::boolean, true)) END)
            WHERE type = 'image' AND jsonb_typeof(data) = 'object';
        `)
        await queryRunner.query(`
            UPDATE page_blocks SET data = jsonb_build_object(
                'media', CASE WHEN data ? 's3key' THEN jsonb_build_object('source', 'upload', 's3key', data -> 's3key') END)
            WHERE type = 'video' AND jsonb_typeof(data) = 'object';
        `)
        await queryRunner.query(`UPDATE page_blocks SET data = '{}'::jsonb WHERE data IS NULL OR jsonb_typeof(data) <> 'object';`)
        await queryRunner.query(`
            ALTER TABLE page_blocks
                ALTER COLUMN data SET DEFAULT '{}'::jsonb,
                ALTER COLUMN data SET NOT NULL,
                DROP COLUMN "column",
                DROP COLUMN row,
                DROP COLUMN width;
            CREATE INDEX idx_page_blocks_page_position ON page_blocks (page_id, position);
        `)
    }

    // Lossy on purpose: block types and widths added by this migration have no
    // equivalent on the old grid, so every block goes back to a row of its own.
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM page_blocks WHERE type NOT IN ('collections', 'files', 'last_files', 'text', 'image', 'video');`)
        await queryRunner.query(`UPDATE page_blocks SET data = to_jsonb(coalesce(data ->> 'html', '')) WHERE type = 'text';`)
        await queryRunner.query(`
            UPDATE page_blocks SET data = jsonb_strip_nulls(jsonb_build_object(
                's3key', data #> '{media,s3key}',
                'url', data #> '{link,url}',
                'external', data #> '{link,external}'))
            WHERE type IN ('image', 'video');
        `)
        await queryRunner.query(`
            DROP INDEX idx_page_blocks_page_position;
            ALTER TABLE page_blocks
                ADD COLUMN "column" integer NOT NULL DEFAULT 0,
                ADD COLUMN row integer NOT NULL DEFAULT 0,
                ADD COLUMN width integer NOT NULL DEFAULT 1;
        `)
        await queryRunner.query(`UPDATE page_blocks SET row = position;`)
        await queryRunner.query(`
            ALTER TABLE page_blocks
                ALTER COLUMN data DROP NOT NULL,
                ALTER COLUMN data DROP DEFAULT,
                ALTER COLUMN data TYPE text USING data::text,
                DROP COLUMN position,
                DROP COLUMN size;
        `)
    }
}

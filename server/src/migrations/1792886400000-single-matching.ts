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

// The old job that applied PRODUCT_MATCHING_REGEX to the files no step owned is
// gone. Its regex becomes the File name step of every asset type still without
// one, so the files it linked are linked again by the next enrichment pass,
// and its schedule stops. A link no step can find again, on a file without a
// type or of a type left without steps, is kept as a link set by hand.
export class SingleMatching1792886400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const pattern = process.env.PRODUCT_MATCHING_REGEX
    if (pattern) {
      await queryRunner.query(`
        INSERT INTO asset_type_resolver_steps (asset_type_id, position, strategy, config)
        SELECT t.id, 0, 'filename_regex', jsonb_build_object('pattern', $1::text, 'keyGroup', 1, 'viewGroup', 2)
        FROM asset_types t
        WHERE NOT EXISTS (SELECT 1 FROM asset_type_resolver_steps s WHERE s.asset_type_id = t.id)
      `, [pattern])
    }
    await queryRunner.query(`
      INSERT INTO asset_entity_links (asset_file_id, target_kind, record_id, record_key, strategy, is_primary, status)
      SELECT a.id, 'record', r.id, r.record_key, 'manual_file', true, 'active'
      FROM asset_files a
      INNER JOIN records r ON r.id = a.record_id
      WHERE NOT EXISTS (SELECT 1 FROM asset_type_resolver_steps s WHERE s.asset_type_id = a.asset_type_id AND s.enabled)
        AND NOT EXISTS (SELECT 1 FROM asset_entity_links l WHERE l.asset_file_id = a.id AND l.strategy = 'manual_file' AND l.target_kind = 'record')
    `)
    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regclass('pgboss.schedule') IS NOT NULL THEN
          DELETE FROM pgboss.schedule WHERE name IN ('asset/assign-products-to-asset-files', 'asset/assign-records-to-asset-files');
        END IF;
      END $$
    `)
  }

  // The steps are the administrator's from now on and the job no longer exists.
  async down(): Promise<void> {}
}

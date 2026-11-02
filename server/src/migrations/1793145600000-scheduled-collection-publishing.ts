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

// A draft collection can carry the moment it publishes itself. Only a draft
// waits to be published: the trigger drops the schedule as soon as the draft
// flag goes, whichever path clears it (a save, a move, the synchronization).
export class ScheduledCollectionPublishing1793145600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE collections
        ADD COLUMN publish_at timestamptz,
        ADD COLUMN publish_scheduled_by_id uuid REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX collections_publish_due ON collections (publish_at) WHERE publish_at IS NOT NULL;

      CREATE FUNCTION clear_collection_publish_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.draft IS NOT TRUE THEN
          NEW.publish_at := NULL;
          NEW.publish_scheduled_by_id := NULL;
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER clear_collection_publish_at BEFORE INSERT OR UPDATE OF draft, publish_at
      ON collections FOR EACH ROW EXECUTE FUNCTION clear_collection_publish_at();
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER clear_collection_publish_at ON collections;
      DROP FUNCTION clear_collection_publish_at();
      ALTER TABLE collections DROP COLUMN publish_scheduled_by_id, DROP COLUMN publish_at;
    `)
  }
}

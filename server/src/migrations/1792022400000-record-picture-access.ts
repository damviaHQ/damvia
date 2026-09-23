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

// Keep real file identities for previews, favourites and queued downloads even
// when no file collection contains the picture. Access is evaluated at read
// time from record membership, never persisted as an independent grant.
export class RecordPictureAccess1792022400000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE collection_files ALTER COLUMN collection_id DROP NOT NULL`)
		await queryRunner.query(`CREATE UNIQUE INDEX idx_record_picture_identity ON collection_files (asset_file_id) WHERE collection_id IS NULL`)
		await queryRunner.query(`
			CREATE FUNCTION create_record_picture_identity() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN
				IF NEW.mime_type LIKE 'image/%' THEN
					INSERT INTO collection_files (asset_file_id, collection_id) VALUES (NEW.id, NULL) ON CONFLICT DO NOTHING;
				END IF;
				RETURN NEW;
			END;
			$$
		`)
		await queryRunner.query(`CREATE TRIGGER create_record_picture_identity AFTER INSERT OR UPDATE OF mime_type ON asset_files FOR EACH ROW EXECUTE FUNCTION create_record_picture_identity()`)
		await queryRunner.query(`
			CREATE FUNCTION delete_record_picture_identity() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN
				DELETE FROM collection_files WHERE asset_file_id = OLD.id AND collection_id IS NULL;
				RETURN OLD;
			END;
			$$
		`)
		await queryRunner.query(`CREATE TRIGGER delete_record_picture_identity BEFORE DELETE ON asset_files FOR EACH ROW EXECUTE FUNCTION delete_record_picture_identity()`)
		await queryRunner.query(`INSERT INTO collection_files (asset_file_id, collection_id) SELECT id, NULL FROM asset_files WHERE mime_type LIKE 'image/%' ON CONFLICT DO NOTHING`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TRIGGER IF EXISTS delete_record_picture_identity ON asset_files`)
		await queryRunner.query(`DROP FUNCTION IF EXISTS delete_record_picture_identity()`)
		await queryRunner.query(`DROP TRIGGER create_record_picture_identity ON asset_files`)
		await queryRunner.query(`DROP FUNCTION create_record_picture_identity()`)
		await queryRunner.query(`DELETE FROM collection_files WHERE collection_id IS NULL`)
		await queryRunner.query(`DROP INDEX idx_record_picture_identity`)
		await queryRunner.query(`ALTER TABLE collection_files ALTER COLUMN collection_id SET NOT NULL`)
	}
}

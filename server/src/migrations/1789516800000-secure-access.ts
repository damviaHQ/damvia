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

export class SecureAccess1789516800000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE users ADD reset_password_expires_at timestamptz;
            ALTER TABLE users ADD auth_version integer NOT NULL DEFAULT 0;
            UPDATE users SET reset_password_token = NULL;
            DELETE FROM user_groups ug USING users u, regions r
            WHERE ug.user_id = u.id AND u.role = 'guest' AND u.region_id = r.id
              AND ug.group_id = r.default_group_id;

            WITH RECURSIVE inherited AS (
                SELECT id, limited_to_group_ids AS groups, true AS editable
                FROM collections WHERE parent_id IS NULL
                UNION ALL
                SELECT c.id,
                    CASE WHEN cardinality(p.groups) > 0 THEN p.groups ELSE c.limited_to_group_ids END,
                    cardinality(p.groups) = 0
                FROM collections c JOIN inherited p ON c.parent_id = p.id
            )
            UPDATE collections c SET limited_to_group_ids = i.groups,
                can_edit_limited_to_group_ids = i.editable
            FROM inherited i WHERE c.id = i.id;

            CREATE FUNCTION inherit_collection_groups() RETURNS trigger LANGUAGE plpgsql AS $$
            DECLARE parent_groups text[];
            BEGIN
                IF NEW.parent_id IS NOT NULL THEN
                    SELECT limited_to_group_ids INTO parent_groups FROM collections
                    WHERE id = NEW.parent_id FOR UPDATE;
                END IF;
                NEW.can_edit_limited_to_group_ids := coalesce(cardinality(parent_groups), 0) = 0;
                IF NOT NEW.can_edit_limited_to_group_ids THEN
                    NEW.limited_to_group_ids := parent_groups;
                END IF;
                RETURN NEW;
            END $$;
            CREATE TRIGGER inherit_collection_groups BEFORE INSERT OR UPDATE OF parent_id, limited_to_group_ids, can_edit_limited_to_group_ids
            ON collections FOR EACH ROW EXECUTE FUNCTION inherit_collection_groups();

            CREATE FUNCTION propagate_collection_groups() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                UPDATE collections SET limited_to_group_ids = NEW.limited_to_group_ids,
                    can_edit_limited_to_group_ids = cardinality(NEW.limited_to_group_ids) = 0
                WHERE parent_id = NEW.id;
                RETURN NEW;
            END $$;
            CREATE TRIGGER propagate_collection_groups AFTER UPDATE OF limited_to_group_ids ON collections
            FOR EACH ROW WHEN (OLD.limited_to_group_ids IS DISTINCT FROM NEW.limited_to_group_ids)
            EXECUTE FUNCTION propagate_collection_groups();
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TRIGGER propagate_collection_groups ON collections;
            DROP FUNCTION propagate_collection_groups();
            DROP TRIGGER inherit_collection_groups ON collections;
            DROP FUNCTION inherit_collection_groups();
            ALTER TABLE users DROP COLUMN auth_version;
            ALTER TABLE users DROP COLUMN reset_password_expires_at;
        `)
    }
}

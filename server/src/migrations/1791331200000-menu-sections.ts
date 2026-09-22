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

// Sidebar headings used to be a single hardcoded "Library" title. They become
// menu items of their own so an administrator can add a "Catalogue" section
// next to it. Existing menus keep their look: everything that was at the root
// moves under a Library section, which also becomes the place where the
// collection synchronization drops the items it creates.
export class MenuSections1791331200000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			DO $$
			DECLARE section_id uuid;
			BEGIN
				INSERT INTO menu_items (type, position, data, home)
				VALUES ('section', 0, '{"label":"Library","defaultForCollections":true}', false)
				RETURNING id INTO section_id;
				UPDATE menu_items SET mpath = section_id::text || '.' WHERE id = section_id;
				UPDATE menu_items
				SET mpath = section_id::text || '.' || mpath,
					parent_id = coalesce(parent_id, section_id)
				WHERE id <> section_id;
			END $$;
		`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			DO $$
			DECLARE section RECORD;
			BEGIN
				FOR section IN SELECT id, mpath FROM menu_items WHERE type = 'section' LOOP
					UPDATE menu_items
					SET mpath = substring(mpath from length(section.mpath) + 1),
						parent_id = CASE WHEN parent_id = section.id THEN NULL ELSE parent_id END
					WHERE id <> section.id AND mpath LIKE section.mpath || '%';
				END LOOP;
				DELETE FROM menu_items WHERE type = 'section';
			END $$;
		`)
	}
}

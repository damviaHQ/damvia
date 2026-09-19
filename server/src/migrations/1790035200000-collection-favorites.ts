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

export class CollectionFavorites1790035200000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE user_collection_favorites (
                user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                created_at timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY (user_id, collection_id)
            );
            CREATE INDEX idx_user_collection_favorites_collection ON user_collection_favorites (collection_id);
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE user_collection_favorites')
    }
}

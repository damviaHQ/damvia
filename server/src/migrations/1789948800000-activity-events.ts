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

export class ActivityEvents1789948800000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE activity_events (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id uuid REFERENCES users(id) ON DELETE SET NULL,
                type varchar NOT NULL,
                asset_file_id uuid REFERENCES asset_files(id) ON DELETE SET NULL,
                collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,
                metadata jsonb NOT NULL DEFAULT '{}',
                created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX idx_activity_events_created_at ON activity_events (created_at);
            CREATE INDEX idx_activity_events_type_created_at ON activity_events (type, created_at);
            CREATE INDEX idx_activity_events_asset_file_id ON activity_events (asset_file_id);
            CREATE INDEX idx_activity_events_user_id ON activity_events (user_id);
            ALTER TABLE users ADD last_login_at timestamptz;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE users DROP COLUMN last_login_at;
            DROP TABLE activity_events;
        `)
    }
}

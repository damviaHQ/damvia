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

export class StorageUsage1789603200000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE storage_usage (
                id integer PRIMARY KEY,
                used_bytes bigint NOT NULL DEFAULT 0,
                reserved_bytes bigint NOT NULL DEFAULT 0,
                measured_at timestamptz,
                alert_level integer NOT NULL DEFAULT 0,
                disk_alert_level integer NOT NULL DEFAULT 0,
                quota_reached_at timestamptz,
                orphan_objects integer NOT NULL DEFAULT 0,
                orphan_bytes bigint NOT NULL DEFAULT 0,
                orphans_removed_at timestamptz
            );
            INSERT INTO storage_usage (id) VALUES (1);
            ALTER TABLE users ADD maintenance_contact boolean NOT NULL DEFAULT false;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE users DROP COLUMN maintenance_contact;
            DROP TABLE storage_usage;
        `)
    }
}

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

export class HostControlledBranding1789776000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE admin_branding')
    }
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE admin_branding (
            id integer PRIMARY KEY CHECK (id = 1),
            logo_source varchar NOT NULL DEFAULT 'damvia' CHECK (logo_source IN ('damvia', 'tenant'))
        )`)
        await queryRunner.query('INSERT INTO admin_branding (id) VALUES (1)')
    }
}

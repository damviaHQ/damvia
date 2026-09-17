/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024 Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>. */
import { MigrationInterface, QueryRunner } from 'typeorm'

export class TrackInvitationCreator1789862400000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE collection_invitations ADD invited_by_id uuid')
        await queryRunner.query(`
            UPDATE collection_invitations invitation
            SET invited_by_id = collection.owner_id
            FROM collections collection
            WHERE collection.id = invitation.collection_id
        `)
        await queryRunner.query(`
            ALTER TABLE collection_invitations
            ADD CONSTRAINT "FK_collection_invitations_invited_by"
            FOREIGN KEY (invited_by_id) REFERENCES users(id) ON DELETE SET NULL
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE collection_invitations DROP CONSTRAINT "FK_collection_invitations_invited_by"')
        await queryRunner.query('ALTER TABLE collection_invitations DROP COLUMN invited_by_id')
    }
}

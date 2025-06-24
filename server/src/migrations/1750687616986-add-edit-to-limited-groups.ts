import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEditToLimitedGroups1750687616986 implements MigrationInterface {
    name = 'AddEditToLimitedGroups1750687616986'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "collections" ADD "can_edit_limited_to_group_ids" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "can_edit_limited_to_group_ids"`);
    }

}

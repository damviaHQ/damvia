import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLimitedToGroupIdsToCollections1750670845530 implements MigrationInterface {
    name = 'AddLimitedToGroupIdsToCollections1750670845530'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "collections" ADD "limited_to_group_ids" text array NOT NULL DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "limited_to_group_ids"`);
    }

}

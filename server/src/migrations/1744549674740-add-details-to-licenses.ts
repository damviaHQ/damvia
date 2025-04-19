import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDetailsToLicenses1744549674740 implements MigrationInterface {
    name = 'AddDetailsToLicenses1744549674740'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "licenses" ADD "details" character varying`);
        await queryRunner.query(`ALTER TABLE "licenses" ALTER COLUMN "usage_from" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "licenses" ALTER COLUMN "usage_to" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "licenses" ALTER COLUMN "usage_to" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "licenses" ALTER COLUMN "usage_from" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "licenses" DROP COLUMN "details"`);
    }

}

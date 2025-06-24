import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserGroups1750683595547 implements MigrationInterface {
    name = 'CreateUserGroups1750683595547'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "group_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ea7760dc75ee1bf0b09ab9b3289" PRIMARY KEY ("id"))`);
        await queryRunner.query("INSERT INTO user_groups (user_id, group_id) SELECT id, group_id FROM users")
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "group_id"`);
        await queryRunner.query(`ALTER TABLE "user_groups" ADD CONSTRAINT "FK_95bf94c61795df25a5154350102" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_groups" ADD CONSTRAINT "FK_4c5f2c23c34f3921fbad2cd3940" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "group_id" uuid`);
        await queryRunner.query(`UPDATE "users" SET "group_id" = (SELECT first_value("group_id") over () FROM "user_groups" WHERE "user_id" = "users"."id")`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "group_id" SET NOT NULL`);
        await queryRunner.query(`DROP TABLE "user_groups"`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_b8d62b3714f81341caa13ab0ff0" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}

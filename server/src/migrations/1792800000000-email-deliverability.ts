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

export class EmailDeliverability1792800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN newsletter_token_version int NOT NULL DEFAULT 0,
        ADD COLUMN email_bounced_at timestamptz,
        ADD COLUMN email_bounce_reason varchar(500);

      ALTER TABLE newsletter_recipients DROP CONSTRAINT newsletter_recipients_status_check;
      ALTER TABLE newsletter_recipients ADD CONSTRAINT newsletter_recipients_status_check
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'bounced', 'complained'));
      -- A new or newly verified address has not bounced, whichever code changed it.
      CREATE FUNCTION users_clear_email_bounce() RETURNS trigger AS $$
      BEGIN
        IF NEW.email IS DISTINCT FROM OLD.email OR (NEW.email_verified AND NOT OLD.email_verified) THEN
          NEW.email_bounced_at := NULL;
          NEW.email_bounce_reason := NULL;
        END IF;
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER users_clear_email_bounce BEFORE UPDATE OF email, email_verified ON users
        FOR EACH ROW EXECUTE FUNCTION users_clear_email_bounce();

      CREATE INDEX IF NOT EXISTS newsletter_recipients_sent ON newsletter_recipients (sent_at) WHERE status IN ('sent', 'bounced', 'complained');
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS newsletter_recipients_sent;
      DROP TRIGGER users_clear_email_bounce ON users;
      DROP FUNCTION users_clear_email_bounce();
      UPDATE newsletter_recipients SET status = 'sent' WHERE status IN ('bounced', 'complained');
      ALTER TABLE newsletter_recipients DROP CONSTRAINT newsletter_recipients_status_check;
      ALTER TABLE newsletter_recipients ADD CONSTRAINT newsletter_recipients_status_check
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped'));
      ALTER TABLE users
        DROP COLUMN newsletter_token_version,
        DROP COLUMN email_bounced_at,
        DROP COLUMN email_bounce_reason;
    `)
  }
}

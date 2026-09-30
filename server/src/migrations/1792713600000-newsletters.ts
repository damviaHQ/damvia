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

export class Newsletters1792713600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN newsletter_opt_out_at timestamptz;

      CREATE TABLE audiences (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(120) NOT NULL,
        filter jsonb NOT NULL,
        created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE newsletters (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(120) NOT NULL,
        subject text NOT NULL DEFAULT '',
        preheader text NOT NULL DEFAULT '',
        heading text NOT NULL DEFAULT '',
        body_html text NOT NULL DEFAULT '',
        audience_id uuid REFERENCES audiences(id) ON DELETE SET NULL,
        filter jsonb NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'scheduled', 'sending', 'sent')),
        scheduled_at timestamptz,
        started_at timestamptz,
        sent_at timestamptz,
        created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX newsletters_due ON newsletters (scheduled_at) WHERE status = 'scheduled';

      CREATE TABLE newsletter_recipients (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        newsletter_id uuid NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        email varchar NOT NULL,
        name varchar NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
        error text,
        sent_at timestamptz,
        UNIQUE (newsletter_id, user_id)
      );
      CREATE INDEX newsletter_recipients_status ON newsletter_recipients (newsletter_id, status);

      CREATE TABLE newsletter_images (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        s3_key varchar NOT NULL,
        content_type varchar(32) NOT NULL,
        width int NOT NULL,
        height int NOT NULL,
        newsletter_id uuid REFERENCES newsletters(id) ON DELETE SET NULL,
        created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE newsletter_images;
      DROP TABLE newsletter_recipients;
      DROP TABLE newsletters;
      DROP TABLE audiences;
      ALTER TABLE users DROP COLUMN newsletter_opt_out_at;
    `)
  }
}

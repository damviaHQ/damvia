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

export class EmailTemplates1792540800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE brand_settings (
        id int PRIMARY KEY,
        accent_color varchar(7),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO brand_settings (id) VALUES (1);

      CREATE TABLE email_settings (
        id int PRIMARY KEY,
        sender_name varchar(120),
        sender_address varchar(254),
        reply_to varchar(254),
        footer_text text NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO email_settings (id) VALUES (1);

      CREATE TABLE email_templates (
        key varchar(64) PRIMARY KEY,
        subject text NOT NULL,
        preheader text NOT NULL DEFAULT '',
        heading text NOT NULL DEFAULT '',
        body_html text NOT NULL,
        button_label text NOT NULL DEFAULT '',
        updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE email_templates;
      DROP TABLE email_settings;
      DROP TABLE brand_settings;
    `)
  }
}

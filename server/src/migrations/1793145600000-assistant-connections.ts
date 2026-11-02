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

// Connections of AI assistants (Claude, ChatGPT...) through the MCP server:
// the OAuth clients they register, the short-lived codes of the consent
// step, and one grant per connection, backed by a session of method `mcp`.
export class AssistantConnections1793145600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_sessions ADD COLUMN client_label varchar(200);
      CREATE TABLE oauth_clients (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(200) NOT NULL,
        redirect_uris text[] NOT NULL,
        client_uri varchar(500),
        logo_uri varchar(500),
        token_endpoint_auth_method varchar(40) NOT NULL DEFAULT 'none',
        secret_hash varchar,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz,
        disabled_at timestamptz
      );
      CREATE TABLE oauth_authorization_codes (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        code_hash varchar NOT NULL UNIQUE,
        client_id uuid NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        redirect_uri varchar(2000) NOT NULL,
        code_challenge varchar(200) NOT NULL,
        scopes text[] NOT NULL,
        resource varchar(2000),
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE oauth_grants (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id uuid NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id uuid NOT NULL UNIQUE REFERENCES user_sessions(id) ON DELETE CASCADE,
        scopes text[] NOT NULL,
        access_token_hash varchar NOT NULL UNIQUE,
        access_expires_at timestamptz NOT NULL,
        refresh_token_hash varchar NOT NULL UNIQUE,
        previous_refresh_token_hash varchar,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX oauth_grants_previous_refresh ON oauth_grants (previous_refresh_token_hash);
      CREATE INDEX oauth_grants_user ON oauth_grants (user_id);
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM user_sessions WHERE method = 'mcp';
      DROP TABLE oauth_grants;
      DROP TABLE oauth_authorization_codes;
      DROP TABLE oauth_clients;
      ALTER TABLE user_sessions DROP COLUMN client_label;
    `)
  }
}

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

// Server-side sessions, single-use email link tokens, login lockout, account
// suspension, TOTP and OIDC identities. Unsalted SHA-512 password hashes left
// over from before the scrypt upgrade are cleared: those accounts sign in
// again after a reset.
export class SecurityHardening1792195200000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE users
				ADD COLUMN failed_login_count int NOT NULL DEFAULT 0,
				ADD COLUMN locked_until timestamptz,
				ADD COLUMN mfa_secret varchar,
				ADD COLUMN mfa_enabled_at timestamptz,
				ADD COLUMN mfa_recovery_codes text[] NOT NULL DEFAULT '{}',
				ADD COLUMN mfa_last_step bigint,
				ADD COLUMN oidc_subject varchar UNIQUE,
				ADD COLUMN suspended_at timestamptz;
			UPDATE users SET password = NULL WHERE password ~ '^[a-f0-9]{128}$';

			ALTER TABLE collection_invitations ADD COLUMN token_hash varchar UNIQUE;

			CREATE TABLE user_sessions (
				id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
				user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
				token_hash varchar NOT NULL UNIQUE,
				method varchar NOT NULL,
				invitation_id uuid REFERENCES collection_invitations ON DELETE CASCADE,
				user_agent varchar,
				created_at timestamptz NOT NULL DEFAULT now(),
				last_seen_at timestamptz NOT NULL DEFAULT now(),
				expires_at timestamptz NOT NULL
			);
			CREATE INDEX idx_user_sessions_user ON user_sessions (user_id);

			CREATE TABLE login_tokens (
				id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
				user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
				token_hash varchar NOT NULL UNIQUE,
				purpose varchar NOT NULL,
				expires_at timestamptz NOT NULL,
				used_at timestamptz,
				created_at timestamptz NOT NULL DEFAULT now()
			);
			CREATE INDEX idx_login_tokens_user ON login_tokens (user_id);
		`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			DROP TABLE login_tokens;
			DROP TABLE user_sessions;
			ALTER TABLE collection_invitations DROP COLUMN token_hash;
			ALTER TABLE users
				DROP COLUMN failed_login_count,
				DROP COLUMN locked_until,
				DROP COLUMN mfa_secret,
				DROP COLUMN mfa_enabled_at,
				DROP COLUMN mfa_recovery_codes,
				DROP COLUMN mfa_last_step,
				DROP COLUMN oidc_subject,
				DROP COLUMN suspended_at;
		`)
	}
}

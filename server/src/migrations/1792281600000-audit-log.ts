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

// An append-only record of administrative and security events. Rows cannot be
// edited or deleted, except to take a deleted person's identity out of them
// and by the retention job, which sets damvia.audit_prune for its transaction.
export class AuditLog1792281600000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE audit_log (
				id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
				created_at timestamptz NOT NULL DEFAULT now(),
				actor_id uuid REFERENCES users ON DELETE SET NULL,
				actor_label varchar,
				action varchar NOT NULL,
				target_type varchar NOT NULL,
				target_id varchar,
				before jsonb,
				after jsonb,
				ip varchar,
				user_agent varchar
			);
			CREATE INDEX idx_audit_log_created_at ON audit_log (created_at DESC);
			CREATE INDEX idx_audit_log_actor ON audit_log (actor_id);
			CREATE INDEX idx_audit_log_target ON audit_log (target_type, target_id);
			CREATE INDEX idx_audit_log_action ON audit_log (action);

			CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN
				IF TG_OP = 'DELETE' THEN
					IF current_setting('damvia.audit_prune', true) = 'on' THEN
						RETURN OLD;
					END IF;
					RAISE EXCEPTION 'audit_log is append-only';
				END IF;
				IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at
					OR NEW.action IS DISTINCT FROM OLD.action OR NEW.target_type IS DISTINCT FROM OLD.target_type
					OR NEW.target_id IS DISTINCT FROM OLD.target_id OR NEW.before IS DISTINCT FROM OLD.before
					OR NEW.after IS DISTINCT FROM OLD.after
					OR (NEW.actor_id IS NOT NULL AND NEW.actor_id IS DISTINCT FROM OLD.actor_id)
					OR (NEW.ip IS NOT NULL AND NEW.ip IS DISTINCT FROM OLD.ip)
					OR (NEW.user_agent IS NOT NULL AND NEW.user_agent IS DISTINCT FROM OLD.user_agent) THEN
					RAISE EXCEPTION 'audit_log is append-only';
				END IF;
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
				FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
		`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			DROP TABLE audit_log;
			DROP FUNCTION audit_log_append_only();
		`)
	}
}

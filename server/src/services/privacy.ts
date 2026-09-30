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
import { EntityManager } from 'typeorm'
import { dataSource } from '../env'

// Everything Damvia holds about one person, for a subject access or
// portability request (GDPR articles 15 and 20). Secrets and hashes are left
// out, and so are other people's addresses and browsers found in the audit
// log.
export async function exportUserData(userId: string) {
	const query = (sql: string) => dataSource.query(sql, [userId])
	const [account] = await query(`
		SELECT u.id, u.name, u.company, o.name AS organisation, u.email, u.role, r.name AS region, u.approved, u.email_verified AS "emailVerified",
			u.maintenance_contact AS "maintenanceContact", u.mfa_enabled_at AS "mfaEnabledAt", u.oidc_subject IS NOT NULL AS "singleSignOn",
			u.suspended_at AS "suspendedAt", u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt", u.updated_at AS "updatedAt"
		FROM users u LEFT JOIN regions r ON r.id = u.region_id LEFT JOIN organisations o ON o.id = u.organisation_id WHERE u.id = $1`)
	if (!account) return null
	const [groups, fileFavorites, collectionFavorites, collections, invitationsReceived, invitationsSent, downloads, activity, recordChanges, sessions, audit, newsletters, [subscription]] = await Promise.all([
		query(`SELECT g.name FROM user_groups ug JOIN groups g ON g.id = ug.group_id WHERE ug.user_id = $1 ORDER BY g.name`),
		query(`SELECT af.name AS file, c.name AS collection, uf.created_at AS "createdAt"
			FROM user_favorites uf JOIN collection_files cf ON cf.id = uf.collection_file_id
			JOIN asset_files af ON af.id = cf.asset_file_id LEFT JOIN collections c ON c.id = cf.collection_id
			WHERE uf.user_id = $1 ORDER BY uf.created_at`),
		query(`SELECT c.name AS collection, f.created_at AS "createdAt" FROM user_collection_favorites f JOIN collections c ON c.id = f.collection_id WHERE f.user_id = $1 ORDER BY f.created_at`),
		query(`SELECT id, name, public, created_at AS "createdAt" FROM collections WHERE owner_id = $1 ORDER BY created_at`),
		query(`SELECT c.name AS collection, i.expires_at AS "expiresAt", i.created_at AS "createdAt"
			FROM collection_invitations i JOIN collections c ON c.id = i.collection_id WHERE i.user_id = $1 ORDER BY i.created_at`),
		query(`SELECT i.email, c.name AS collection, i.expires_at AS "expiresAt", i.created_at AS "createdAt"
			FROM collection_invitations i JOIN collections c ON c.id = i.collection_id WHERE i.invited_by_id = $1 ORDER BY i.created_at`),
		query(`SELECT id, type, status, cardinality(collection_file_ids) AS files, license_accepted_at AS "licenseAcceptedAt",
			expires_at AS "expiresAt", created_at AS "createdAt" FROM downloads WHERE user_id = $1 ORDER BY created_at`),
		query(`SELECT type, collection_id AS "collectionId", asset_file_id AS "assetFileId", metadata, created_at AS "createdAt"
			FROM activity_events WHERE user_id = $1 ORDER BY created_at`),
		query(`SELECT record_key AS "recordKey", action, source, changes, created_at AS "createdAt"
			FROM record_changes WHERE changed_by_id = $1 ORDER BY created_at`),
		query(`SELECT method, user_agent AS "userAgent", created_at AS "createdAt", last_seen_at AS "lastSeenAt", expires_at AS "expiresAt"
			FROM user_sessions WHERE user_id = $1 ORDER BY created_at`),
		query(`SELECT created_at AS "createdAt", action, target_type AS "targetType", target_id AS "targetId", before, after,
			actor_id = $1 AS "byYou", CASE WHEN actor_id = $1 THEN ip END AS ip, CASE WHEN actor_id = $1 THEN user_agent END AS "userAgent"
			FROM audit_log WHERE actor_id = $1 OR (target_type = 'user' AND target_id = $1::text) ORDER BY created_at`),
		query(`SELECT n.subject, r.email, r.status, r.sent_at AS "sentAt" FROM newsletter_recipients r
			JOIN newsletters n ON n.id = r.newsletter_id WHERE r.user_id = $1 ORDER BY n.started_at, n.id`),
		query(`SELECT newsletter_opt_out_at AS "unsubscribedAt", email_bounced_at AS "bouncedAt", email_bounce_reason AS "bounceReason" FROM users WHERE id = $1`),
	])
	return {
		exportedAt: new Date().toISOString(),
		account,
		groups: groups.map((row: { name: string }) => row.name),
		favorites: { files: fileFavorites, collections: collectionFavorites },
		collections,
		invitations: { received: invitationsReceived, sent: invitationsSent },
		downloads,
		activity,
		recordChanges,
		sessions,
		audit,
		newsletters: { subscribed: !subscription.unsubscribedAt, ...subscription, received: newsletters },
	}
}

// Keeps what other people rely on (record history, statistics, the audit
// trail) while removing who the deleted person was. Rows already point to no
// one through ON DELETE SET NULL; this clears what still names them.
export async function anonymiseUser(em: EntityManager, user: { id: string, email: string }) {
	const label = `deleted user ${user.id.slice(0, 8)}`
	await em.query(`UPDATE audit_log SET actor_label = $2, ip = NULL, user_agent = NULL WHERE actor_id = $1`, [user.id, label])
	await em.query(`UPDATE audit_log SET actor_label = $2 WHERE actor_id IS NULL AND lower(actor_label) = lower($1)`, [user.email, label])
	await em.query(`UPDATE activity_events SET user_id = NULL WHERE user_id = $1`, [user.id])
	await em.query(`UPDATE record_changes SET changed_by_id = NULL WHERE changed_by_id = $1`, [user.id])
	// Kept so a newsletter's counts stay right, without saying who it reached.
	await em.query(`UPDATE newsletter_recipients SET email = '', name = $2, user_id = NULL WHERE user_id = $1`, [user.id, label])
}

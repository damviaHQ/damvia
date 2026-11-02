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
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm"
import { User } from "./user"
import { UserSession } from "./user-session"

// An application that connects assistants to Damvia, such as Claude or
// ChatGPT. It registers itself (RFC 7591); its id is the OAuth client_id.
@Entity('oauth_clients')
export class OAuthClient {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	name: string

	@Column({ type: 'text', array: true })
	redirectUris: string[]

	@Column({ type: 'varchar', nullable: true })
	clientUri: string | null

	@Column({ type: 'varchar', nullable: true })
	logoUri: string | null

	// `none` for public clients, which prove themselves with PKCE only.
	@Column()
	tokenEndpointAuthMethod: string

	@Column({ type: 'varchar', nullable: true, select: false })
	secretHash: string | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date

	@Column({ type: 'timestamptz', nullable: true })
	lastUsedAt: Date | null

	@Column({ type: 'timestamptz', nullable: true })
	disabledAt: Date | null
}

// The one-minute code a client exchanges for tokens after the person agreed.
@Entity('oauth_authorization_codes')
export class OAuthAuthorizationCode {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	codeHash: string

	@Column()
	clientId: string

	@ManyToOne(() => OAuthClient, { onDelete: 'CASCADE' })
	client: OAuthClient

	@Column()
	userId: string

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	user: User

	@Column()
	redirectUri: string

	@Column()
	codeChallenge: string

	@Column({ type: 'text', array: true })
	scopes: string[]

	@Column({ type: 'varchar', nullable: true })
	resource: string | null

	@Column({ type: 'timestamptz' })
	expiresAt: Date

	@Column({ type: 'timestamptz', nullable: true })
	usedAt: Date | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date
}

// One assistant connection. It lives as long as its session: revoking the
// session, suspending or deleting the person, or resetting their password
// ends it.
@Entity('oauth_grants')
export class OAuthGrant {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	clientId: string

	@ManyToOne(() => OAuthClient, { onDelete: 'CASCADE' })
	client: OAuthClient

	@Column()
	userId: string

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	user: User

	@Column()
	sessionId: string

	@ManyToOne(() => UserSession, { onDelete: 'CASCADE' })
	session: UserSession

	@Column({ type: 'text', array: true })
	scopes: string[]

	@Column()
	accessTokenHash: string

	@Column({ type: 'timestamptz' })
	accessExpiresAt: Date

	@Column()
	refreshTokenHash: string

	@Column({ type: 'varchar', nullable: true })
	previousRefreshTokenHash: string | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date

	@Column({ type: 'timestamptz' })
	lastUsedAt: Date
}

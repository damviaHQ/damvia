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
import { CollectionInvitation } from "./collection-invitation"
import { User } from "./user"

export enum SessionMethod {
	PASSWORD = 'password',
	EMAIL_LINK = 'email_link',
	INVITATION = 'invitation',
	SSO = 'sso',
	PASSWORD_RESET = 'password_reset',
	SIGN_UP = 'sign_up',
	LEGACY = 'legacy',
}

@Entity('user_sessions')
export class UserSession {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	userId: string

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	user: User

	@Column()
	tokenHash: string

	@Column({ enum: SessionMethod })
	method: SessionMethod

	@Column({ type: 'varchar', nullable: true })
	invitationId: string | null

	@ManyToOne(() => CollectionInvitation, { onDelete: 'CASCADE' })
	invitation: CollectionInvitation | null

	@Column({ type: 'varchar', nullable: true })
	userAgent: string | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date

	@Column({ type: 'timestamptz' })
	lastSeenAt: Date

	@Column({ type: 'timestamptz' })
	expiresAt: Date
}

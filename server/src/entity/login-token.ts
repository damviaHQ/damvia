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

export enum LoginTokenPurpose {
	LOGIN = 'login',
	APPROVED = 'approved',
}

// A single-use secret sent by email and exchanged for a session.
@Entity('login_tokens')
export class LoginToken {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	userId: string

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	user: User

	@Column()
	tokenHash: string

	@Column({ enum: LoginTokenPurpose })
	purpose: LoginTokenPurpose

	@Column({ type: 'timestamptz' })
	expiresAt: Date

	@Column({ type: 'timestamptz', nullable: true })
	usedAt: Date | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date
}

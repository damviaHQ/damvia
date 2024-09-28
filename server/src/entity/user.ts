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
import {
	Column,
	CreateDateColumn,
	Entity,
	ManyToOne,
	OneToMany,
	PrimaryColumn,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from "typeorm"
import { CollectionInvitation } from "./collection-invitation"
import { Group } from "./group"
import { Region } from "./region"
import { UserFavorite } from "./user-favorite"

export enum UserRole {
	ADMIN = "admin",
	MANAGER = "manager",
	MEMBER = "member",
	GUEST = "guest",
}

@Entity('users')
export class User {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	name: string

	@Column()
	company: string

	@Column({ unique: true })
	email: string

	@Column({ nullable: false, default: false })
	emailVerified: boolean

	@Column({ nullable: true })
	emailVerificationCode: string

	@Column({ nullable: true })
	password: string | null

	@Column({ nullable: true })
	resetPasswordToken: string

	@Column({ enum: UserRole, default: UserRole.GUEST })
	role: UserRole

	@Column({ default: false })
	approved: boolean

	@Column()
	groupId: string

	@ManyToOne(() => Group, (g) => g.users)
	group: Group

	@Column()
	regionId: string

	@ManyToOne(() => Region, (r) => r.users)
	region: Region

	@OneToMany(() => UserFavorite, (favorite) => favorite.user)
	favorites: UserFavorite[]

	@OneToMany(() => CollectionInvitation, (invitation) => invitation.user)
	invitations: CollectionInvitation[]

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

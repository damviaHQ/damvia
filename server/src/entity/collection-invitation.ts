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
	PrimaryColumn,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from "typeorm"
import { Collection } from "./collection"
import { User } from "./user"

@Entity('collection_invitations')
export class CollectionInvitation {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	collectionId: string

	@ManyToOne(() => Collection, (collection) => collection.invitations, { onDelete: 'CASCADE' })
	collection: Collection

	@Column()
	email: string

	@Column({ nullable: true })
	userId: string | null

	@ManyToOne(() => User, (user) => user.invitations, { onDelete: 'CASCADE' })
	user: User

	@Column({ type: 'date' })
	expiresAt: Date

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date

	get hasExpired() {
		return Date.now() >= new Date(this.expiresAt).getTime()
	}
}

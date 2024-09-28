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
	Entity, Index,
	JoinColumn, OneToMany,
	OneToOne,
	PrimaryColumn,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from "typeorm"
import collection from "../trpc/router/collection"
import { Collection } from "./collection"
import { PageBlock } from "./page-block"
import { User, UserRole } from "./user"

@Entity('pages')
export class Page {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({ nullable: true })
	name: string | null

	@Column({ nullable: true })
	@Index({ unique: true, where: "collection_id IS NOT NULL" })
	collectionId: string | null

	@OneToOne(() => Collection, (collection) => collection.page, { onDelete: 'CASCADE' })
	@JoinColumn()
	collection: Collection | null

	@OneToMany(() => PageBlock, (block) => block.page)
	blocks: PageBlock[]

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date

	canEdit(user: User) {
		return user.role === UserRole.ADMIN || this.collection?.canEdit(user) || false
	}
}

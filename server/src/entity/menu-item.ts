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
	PrimaryGeneratedColumn, Tree,
	TreeChildren,
	TreeParent,
	UpdateDateColumn
} from "typeorm"
import { Collection } from "./collection"
import { Page } from "./page"

export enum MenuItemType {
	COLLECTION = 'collection',
	PAGE = 'page',
	TEXT = 'text',
	DIVIDER = 'divider',
}

@Entity('menu_items')
@Tree('materialized-path')
export class MenuItem {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({ enum: MenuItemType })
	type: MenuItemType

	@Column()
	position: number

	@Column("simple-json", { nullable: true })
	data: any

	@Column({ nullable: true })
	collectionId: string | null

	@ManyToOne(() => Collection, { onDelete: 'CASCADE' })
	collection: Collection | null

	@Column({ nullable: true, })
	pageId: string | null

	@ManyToOne(() => Page, { onDelete: 'CASCADE' })
	page: Page | null

	@Column({ name: 'mpath', update: false, insert: false, nullable: true, default: '' })
	path?: string | null

	@Column({ nullable: true })
	parentId: string | null

	@TreeParent({ onDelete: 'CASCADE' })
	parent: MenuItem | null

	@Column({ default: false })
	home: boolean

	@TreeChildren()
	children: MenuItem[]

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

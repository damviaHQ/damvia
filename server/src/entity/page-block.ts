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
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from "typeorm"
import { Page } from "./page"

export enum PageBlockType {
	COLLECTIONS = 'collections',
	FILES = 'files',
	LAST_FILES = 'last_files',
	TEXT = 'text',
	IMAGE = 'image',
	VIDEO = 'video',
}

@Entity('page_blocks')
export class PageBlock {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	pageId: string

	@ManyToOne(() => Page, (page) => page.blocks, { onDelete: 'CASCADE' })
	@JoinColumn()
	page: Page

	@Column({ enum: PageBlockType })
	type: PageBlockType

	@Column({ type: 'integer' })
	column: number

	@Column({ type: 'integer' })
	row: number

	@Column({ type: 'integer' })
	width: number

	@Column("simple-json", { nullable: true })
	data: any

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date

	constructor(opts?: { pageId: string, type: PageBlockType, column: number, row: number, width: number, data?: any }) {
		this.pageId = opts?.pageId
		this.type = opts?.type
		this.column = opts?.column
		this.row = opts?.row
		this.width = opts?.width
		this.data = opts?.data
	}
}

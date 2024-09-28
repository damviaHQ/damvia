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
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
	PrimaryColumn,
	PrimaryGeneratedColumn,
	Tree,
	TreeChildren,
	TreeParent,
	Unique,
	UpdateDateColumn
} from "typeorm"
import { AssetFolder } from "./asset-folder"
import { CollectionFile } from "./collection-file"
import { CollectionInvitation } from "./collection-invitation"
import { Page } from "./page"
import { User, UserRole } from "./user"

@Entity('collections')
@Tree('materialized-path')
@Unique('idx_parent_id_name', ['parentId', 'name'])
export class Collection {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	name: string

	@Column({ nullable: true })
	description: string | null

	@Column()
	@Index()
	public: boolean

	@Column()
	@Index()
	draft: boolean

	@Column({ nullable: true })
	@Index()
	assetFolderId: string | null

	@ManyToOne(() => AssetFolder, (asset) => asset.collections)
	@JoinColumn()
	assetFolder: AssetFolder | null

	@Column({ nullable: true })
	@Index()
	parentId: string | null

	@TreeParent({ onDelete: 'CASCADE' })
	parent: Collection | null

	@TreeChildren()
	children: Collection[]

	@Column({ type: 'uuid', array: true, nullable: false, default: '{}' })
	sampleFileIds: string[]

	@OneToMany(() => CollectionFile, (file) => file.collection)
	files: CollectionFile[]

	@OneToMany(() => CollectionInvitation, (invitation) => invitation.collection)
	invitations: CollectionInvitation[]

	@Column({ nullable: true })
	@Index()
	ownerId: string | null

	@ManyToOne(() => User)
	owner: User

	@Column({ name: 'mpath', update: false, insert: false, nullable: true, default: '' })
	path?: string | null

	@Column({ default: 0, update: false, insert: false })
	numberOfFiles: number

	@Column({ default: false, nullable: false })
	hasThumbnail: boolean

	@OneToOne(() => Page, (page) => page.collection)
	page?: Page | null

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date

	get parentCollectionIds() {
		return this.path?.split('.').filter((v) => v)
	}

	get synchronized() {
		return !!this.assetFolderId
	}

	canEdit(editor: User) {
		return editor.role === UserRole.ADMIN || editor.id === this.ownerId
	}

	get thumbnailStorageKey() {
		return `collections/${this.id}-thumbnail`
	}
}

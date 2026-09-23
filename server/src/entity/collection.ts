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
	UpdateDateColumn
} from "typeorm"
import type { RelatedRecordsSettings } from "../services/catalogue"
import type { RecordFilter } from "../services/records"
import { AssetFolder } from "./asset-folder"
import { CollectionFile } from "./collection-file"
import { CollectionRecord } from "./collection-record"
import { CollectionInvitation } from "./collection-invitation"
import { Page } from "./page"
import { User, UserRole } from "./user"

export const ACTION_BAR_ACTIONS = ['filter', 'search', 'display', 'share'] as const
export type ActionBarAction = typeof ACTION_BAR_ACTIONS[number]
export type ActionBarRule = {
	mode: 'everyone' | 'only' | 'except' | 'nobody'
	roles: UserRole[]
	groupIds: string[]
	userIds: string[]
}
// An action left out is shown to everyone.
export type ActionBarSettings = Partial<Record<ActionBarAction, ActionBarRule>>

// What a reader browses in the collection: its files, the records it holds, or
// both behind two tabs.
export const CATALOGUE_MODES = ['files', 'products', 'both'] as const
export type CatalogueMode = typeof CATALOGUE_MODES[number]

@Entity('collections')
@Tree('materialized-path')
@Index('idx_collections_parent_asset_folder', ['parentId', 'assetFolderId'], { unique: true, where: 'asset_folder_id IS NOT NULL' })
export class Collection {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	name: string

	@Column({ type: 'varchar', nullable: true })
	description: string | null

	@Column()
	@Index()
	public: boolean

	@Column()
	@Index()
	draft: boolean

	@Column({ type: 'varchar', nullable: true })
	@Index()
	assetFolderId: string | null

	@ManyToOne(() => AssetFolder, (asset) => asset.collections)
	@JoinColumn()
	assetFolder: AssetFolder | null

	@Column({ type: 'varchar', nullable: true })
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

	@OneToMany(() => CollectionRecord, (record) => record.collection)
	records: CollectionRecord[]

	// Null means the membership is chosen by hand. A list of rules makes the
	// collection dynamic: the enrichment pass writes its members.
	@Column({ type: 'jsonb', nullable: true })
	recordFilters: RecordFilter[] | null

	@Column({ type: 'uuid', nullable: true })
	recordTableId: string | null

	// The whole catalogue in one entry, without a membership row per record.
	@Column({ default: false })
	includesAllRecords: boolean

	@Column({ default: 0, update: false, insert: false })
	numberOfRecords: number

	@Column({ type: 'varchar', default: 'files' })
	catalogueMode: CatalogueMode

	@OneToMany(() => CollectionInvitation, (invitation) => invitation.collection)
	invitations: CollectionInvitation[]

	@Column({ type: 'varchar', nullable: true })
	@Index()
	ownerId: string | null

	@ManyToOne(() => User)
	owner: User | null

	@Column({ type: 'varchar', name: 'mpath', update: false, insert: false, nullable: true, default: '' })
	path?: string | null

	@Column({ default: 0, update: false, insert: false })
	numberOfFiles: number

	@Column({ default: false, nullable: false })
	hasThumbnail: boolean

	@Column({ type: "text", default: [], nullable: false, array: true })
	limitedToGroupIds: string[]

	@Column({ type: "boolean", nullable: false, default: true })
	canEditLimitedToGroupIds: boolean

	// Null follows the parent.
	@Column({ type: 'jsonb', nullable: true })
	actionBar: ActionBarSettings | null

	@OneToOne(() => Page, (page) => page.collection)
	page?: Page | null

	@Column({ type: 'timestamp', nullable: true })
	orphanedAt: Date | null

	@Column({ type: 'varchar', nullable: true })
	orphanedFromName: string | null

	@Column({ type: 'varchar', nullable: true })
	orphanedReason: string | null

	@Column({ type: 'jsonb', nullable: true })
	relatedRecords: RelatedRecordsSettings | null

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

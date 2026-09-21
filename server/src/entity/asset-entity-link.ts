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
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"
import { AssetFile } from "./asset-file"
import { DataRecord } from "./data-record"
import { User } from "./user"

export type EntityLinkStrategy = 'filename_regex' | 'folder_regex' | 'manual_folder' | 'csv' | 'metadata' | 'manual_file'

@Entity('asset_entity_links')
export class AssetEntityLink {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	assetFileId: string

	@ManyToOne(() => AssetFile, { onDelete: 'CASCADE' })
	assetFile: AssetFile

	@Column({ type: 'varchar' })
	targetKind: 'record' | 'attribute'

	@Column({ type: 'varchar', nullable: true })
	recordId: string | null

	@ManyToOne(() => DataRecord, { onDelete: 'SET NULL' })
	record: DataRecord | null

	@Column({ type: 'text', nullable: true })
	recordKey: string | null

	@Column({ type: 'text', nullable: true })
	attributeName: string | null

	@Column({ type: 'text', nullable: true })
	attributeValue: string | null

	@Column({ type: 'varchar' })
	strategy: EntityLinkStrategy

	@Column({ type: 'varchar', nullable: true })
	resolverStepId: string | null

	@Column({ type: 'varchar', nullable: true })
	sourceFolderId: string | null

	@Column({ default: false })
	isPrimary: boolean

	@Column({ type: 'varchar', default: 'active' })
	status: 'active' | 'dangling'

	@Column({ type: 'varchar', nullable: true })
	createdById: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	createdBy: User | null

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

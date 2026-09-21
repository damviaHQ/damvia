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
import { AssetFolder } from "./asset-folder"
import { User } from "./user"

@Entity('asset_folder_entity_attachments')
export class AssetFolderEntityAttachment {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	assetFolderId: string

	@ManyToOne(() => AssetFolder, { onDelete: 'CASCADE' })
	assetFolder: AssetFolder

	@Column({ type: 'varchar' })
	targetKind: 'record' | 'attribute'

	@Column({ type: 'varchar', nullable: true })
	recordId: string | null

	@Column({ type: 'text', nullable: true })
	recordKey: string | null

	@Column({ type: 'text', nullable: true })
	attributeName: string | null

	@Column({ type: 'text', nullable: true })
	attributeValue: string | null

	@Column({ type: 'varchar', nullable: true })
	createdById: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	createdBy: User | null

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

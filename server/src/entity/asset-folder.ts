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
	Tree,
	TreeChildren,
	TreeParent,
	UpdateDateColumn,
} from "typeorm"
import { AssetFile } from "./asset-file"
import { AssetType } from "./asset-type"
import { Collection } from "./collection"
import { License } from "./license"

export enum AssetFolderStatus {
	UP_TO_DATE = 'up_to_date',
	PENDING_DELETION = 'pending_deletion',
}

@Entity('asset_folders')
@Tree('materialized-path')
export class AssetFolder {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	name: string

	@Column({ enum: AssetFolderStatus })
	status: AssetFolderStatus

	@Column({ unique: true })
	externalId: string

	@Column({ nullable: true })
	parentId: string | null

	@TreeParent()
	parent: AssetFolder | null

	@Column({ nullable: true })
	assetTypeId: string | null

	@ManyToOne(() => AssetType)
	assetType: AssetType | null

	@Column({ nullable: true })
	licenseId: string | null

	@ManyToOne(() => License)
	license: License | null

	@TreeChildren()
	children: AssetFolder[]

	@OneToMany(() => AssetFile, (f) => f.folder)
	files: AssetFile[]

	@OneToMany(() => Collection, (c) => c.assetFolder)
	collections: Collection[]

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

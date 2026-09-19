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
	Index,
	JoinColumn,
	ManyToOne, OneToMany,
	PrimaryColumn,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from "typeorm"
import { AssetFolder } from "./asset-folder"
import { AssetType } from "./asset-type"
import { CollectionFile } from "./collection-file"
import { License } from "./license"
import { Product } from "./product"

export enum AssetFileStatus {
	CREATING = 'creating',
	UP_TO_DATE = 'up_to_date',
	OUTDATED = 'outdated',
	PENDING_DELETION = 'pending_deletion',
}

@Entity('asset_files')
@Index(['sourceKey', 'externalId'], { unique: true })
export class AssetFile {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	name: string

	@Column({ enum: AssetFileStatus })
	status: AssetFileStatus

	@Column()
	externalId: string

	@Column({ default: '' })
	sourceKey: string

	@Column()
	externalChecksum: string

	@Column({ default: false })
	hasThumbnail: boolean

	@Column({ type: 'bigint' })
	size: string

	@Column({ type: 'integer', nullable: true })
	height: number | null

	@Column({ type: 'integer', nullable: true })
	width: number | null

	@Column()
	mimeType: string

	@Column()
	folderId: string

	@ManyToOne(() => AssetFolder, (r) => r.files)
	@JoinColumn()
	folder: AssetFolder

	@OneToMany(() => CollectionFile, (r) => r.assetFile)
	collectionFiles: CollectionFile[]

	@Column({ type: 'varchar', nullable: true })
	assetTypeId: string | null

	@ManyToOne(() => AssetType)
	assetType: AssetType | null

	@Column({ type: 'varchar', nullable: true })
	licenseId: string | null

	@ManyToOne(() => License)
	license: License | null

	@Column({ type: 'varchar', nullable: true })
	productId: string | null

	@ManyToOne(() => Product, (product) => product.assetFiles)
	product: Product | null

	@Column({ type: 'varchar', nullable: true })
	productView: string | null

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date

	get originalStorageKey() {
		return `asset-file/${this.id}`
	}

	get thumbnailStorageKey() {
		return `asset-file/${this.id}-thumbnail`
	}
}

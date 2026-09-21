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
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm"
import { AssetFolder } from "./asset-folder"
import { AssetType } from "./asset-type"

@Entity('variant_groups')
@Unique(['assetFolderId', 'assetTypeId', 'prefixKey'])
export class VariantGroup {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	assetFolderId: string

	@ManyToOne(() => AssetFolder, { onDelete: 'CASCADE' })
	assetFolder: AssetFolder

	@Column()
	assetTypeId: string

	@ManyToOne(() => AssetType, { onDelete: 'CASCADE' })
	assetType: AssetType

	@Column('text')
	prefixKey: string

	@Column('text')
	displayName: string

	@Column({ type: 'varchar', nullable: true })
	coverAssetFileId: string | null

	@Column({ type: 'int' })
	memberCount: number

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

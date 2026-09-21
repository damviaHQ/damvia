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
import { AssetType } from "./asset-type"

export type ResolverStrategy = 'filename_regex' | 'folder_regex' | 'manual_folder' | 'csv' | 'metadata'

export type ResolverStepConfig = {
	pattern?: string
	keyGroup?: number
	viewGroup?: number | null
	target?: 'record' | 'attribute'
	attributeName?: string
	valueGroup?: number
	metadataFieldId?: string
}

@Entity('asset_type_resolver_steps')
export class AssetTypeResolverStep {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	assetTypeId: string

	@ManyToOne(() => AssetType, { onDelete: 'CASCADE' })
	assetType: AssetType

	@Column({ type: 'int' })
	position: number

	@Column({ type: 'varchar' })
	strategy: ResolverStrategy

	@Column({ type: 'jsonb', default: {} })
	config: ResolverStepConfig

	@Column({ default: true })
	enabled: boolean

	@Column({ type: 'text', nullable: true })
	lastError: string | null

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

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
import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

export type MetadataValueType = 'text' | 'date' | 'number' | 'gps'

@Entity('metadata_fields')
export class MetadataField {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({ type: 'text', unique: true })
	name: string

	@Column({ type: 'text', nullable: true })
	displayName: string | null

	@Column({ type: 'varchar' })
	valueType: MetadataValueType

	@Column({ default: false })
	searchable: boolean

	@Column({ default: false })
	facetable: boolean

	@Column({ default: false })
	viewable: boolean

	@Column({ default: false })
	canLink: boolean

	@Column({ type: 'varchar', nullable: true })
	linkTarget: 'record_key' | 'attribute' | null

	@Column({ type: 'text', nullable: true })
	linkAttributeName: string | null

	@Column({ type: 'int', default: 0 })
	fileCount: number

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

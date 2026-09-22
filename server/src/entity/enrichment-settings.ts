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
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm"

@Entity('enrichment_settings')
export class EnrichmentSettings {
	@PrimaryColumn({ type: 'int' })
	id: number

	@Column({ default: 'Product' })
	recordLabelSingular: string

	@Column({ default: 'Products' })
	recordLabelPlural: string

	@Column({ default: false })
	viewsEnabled: boolean

	@Column({ default: '.' })
	viewSeparator: string

	@Column({ type: 'int', default: 2 })
	viewDigits: number

	@Column({ default: '00' })
	thumbnailView: string

	// A product with no media the reader can open stays out of the catalogue.
	@Column({ default: false })
	hideRecordsWithoutMedia: boolean

	// The field holding the model a product belongs to, and the fields telling
	// the members of that family apart.
	@Column({ type: 'varchar', nullable: true })
	familyAttributeName: string | null

	@Column({ type: 'text', array: true, default: '{}' })
	familyAxisAttributeNames: string[]

	@UpdateDateColumn()
	updatedAt: Date
}

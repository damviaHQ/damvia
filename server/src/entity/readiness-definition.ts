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
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

// What a product must carry to count as ready. One definition per record table,
// plus a catalogue-wide one when no table is named.
@Entity('readiness_definitions')
export class ReadinessDefinition {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({ type: 'uuid', nullable: true })
	tableId: string | null

	@Column({ type: 'uuid', array: true, default: '{}' })
	requiredAttributeIds: string[]

	@Column({ type: 'text', array: true, default: '{}' })
	requiredViews: string[]

	@Column({ default: 'Ready to use' })
	readyLabel: string

	@Column({ default: 'To complete' })
	incompleteLabel: string

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

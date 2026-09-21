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
import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm"

export type RecordChangeAction = 'create' | 'update' | 'delete'
export type RecordChangeSource = 'grid' | 'panel' | 'bulk' | 'csv' | 'unmatched' | 'attribute'
export type RecordChanges = Record<string, { old: string | null, new: string | null }>

// One row per record per operation. The key is kept so the history of a
// deleted record stays readable, and a key imported again finds its past.
@Entity('record_changes')
export class RecordChange {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({ type: 'uuid', nullable: true })
	recordId: string | null

	@Column({ type: 'text' })
	recordKey: string

	@Column({ type: 'varchar' })
	action: RecordChangeAction

	@Column({ type: 'varchar' })
	source: RecordChangeSource

	@Column({ type: 'jsonb', default: {} })
	changes: RecordChanges

	@Column({ type: 'uuid', nullable: true })
	changedById: string | null

	@Column({ type: 'uuid', nullable: true })
	importBatchId: string | null

	@Column({ type: 'timestamp', default: () => 'now()' })
	createdAt: Date
}

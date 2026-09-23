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
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
} from "typeorm"
import { Collection } from "./collection"
import { DataRecord } from "./data-record"

// How a record joined a collection: an editor picked it, or the collection's
// rules matched it. A rule refresh only ever rewrites its own rows.
export enum CollectionRecordSource {
	MANUAL = 'manual',
	RULE = 'rule',
}

@Entity('collection_records')
export class CollectionRecord {
	@PrimaryColumn({ type: 'uuid' })
	collectionId: string

	@ManyToOne(() => Collection, (collection) => collection.records, { onDelete: 'CASCADE' })
	@JoinColumn()
	collection: Collection

	@PrimaryColumn({ type: 'uuid' })
	recordId: string

	@ManyToOne(() => DataRecord, { onDelete: 'CASCADE' })
	@JoinColumn()
	record: DataRecord

	@Column({ type: 'varchar', default: CollectionRecordSource.MANUAL })
	source: CollectionRecordSource

	@Column({ default: 0 })
	position: number

	// Kept in the collection but taken out of what readers get.
	@Column({ default: false })
	excluded: boolean

	@CreateDateColumn()
	createdAt: Date
}

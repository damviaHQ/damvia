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
import { Column, Entity, PrimaryColumn } from "typeorm"

@Entity('storage_usage')
export class StorageUsage {
	@PrimaryColumn()
	id: number

	@Column({ type: 'bigint' })
	usedBytes: string

	@Column({ type: 'bigint' })
	reservedBytes: string

	@Column({ type: 'timestamptz', nullable: true })
	measuredAt: Date | null

	@Column()
	alertLevel: number

	@Column()
	diskAlertLevel: number

	@Column({ type: 'timestamptz', nullable: true })
	quotaReachedAt: Date | null

	@Column()
	orphanObjects: number

	@Column({ type: 'bigint' })
	orphanBytes: string

	@Column({ type: 'timestamptz', nullable: true })
	orphansRemovedAt: Date | null
}

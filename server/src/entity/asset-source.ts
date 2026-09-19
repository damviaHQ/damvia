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

// One row per configured source, refreshed at startup, carrying the outcome
// of its last sync run for the admin dashboard.
@Entity('asset_sources')
export class AssetSource {
	@PrimaryColumn()
	key: string

	@Column()
	provider: string

	@Column({ type: 'varchar', nullable: true })
	label: string | null

	@Column()
	root: string

	@Column({ type: 'timestamptz', nullable: true })
	lastRunStartedAt: Date | null

	@Column({ type: 'timestamptz', nullable: true })
	lastRunFinishedAt: Date | null

	@Column({ type: 'timestamptz', nullable: true })
	lastSuccessAt: Date | null

	@Column({ type: 'text', nullable: true })
	lastError: string | null
}

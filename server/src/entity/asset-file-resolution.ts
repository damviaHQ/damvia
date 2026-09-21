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

export type ResolutionStatus = 'matched' | 'unmatched' | 'conflict' | 'not_applicable'

export type ResolutionCandidate = {
	strategy: string
	stepId: string | null
	kind: 'record' | 'attribute'
	key?: string
	view?: string | null
	attributeName?: string
	attributeValue?: string
	consumedSpan?: [number, number] | null
}

@Entity('asset_file_resolutions')
export class AssetFileResolution {
	@PrimaryColumn('uuid')
	assetFileId: string

	@Column({ type: 'varchar' })
	status: ResolutionStatus

	@Column({ type: 'jsonb', default: [] })
	candidates: ResolutionCandidate[]

	@Column({ type: 'text', nullable: true })
	reason: string | null

	@Column({ type: 'timestamp', default: () => 'now()' })
	resolvedAt: Date
}

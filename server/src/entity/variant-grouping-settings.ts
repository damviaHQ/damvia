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

@Entity('variant_grouping_settings')
export class VariantGroupingSettings {
	@PrimaryColumn({ type: 'int' })
	id: number

	@Column({ type: 'int', default: 4 })
	minPrefixLength: number

	@Column({ type: 'text', array: true })
	blockedTokens: string[]

	@UpdateDateColumn()
	updatedAt: Date
}

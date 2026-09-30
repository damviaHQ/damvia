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
import { User, UserRole } from "./user"

// Who a newsletter goes to. Everyone, or the people matching every criterion
// that is set, plus people added by hand, minus people left out by hand.
export type AudienceFilter = {
	everyone: boolean
	roles: `${UserRole}`[]
	groupIds: string[]
	regionIds: string[]
	includeUserIds: string[]
	excludeUserIds: string[]
}

// A selection saved to be used again.
@Entity('audiences')
export class Audience {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({ type: 'varchar', length: 120 })
	name: string

	@Column({ type: 'jsonb' })
	filter: AudienceFilter

	@Column({ type: 'uuid', nullable: true })
	createdById: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	createdBy: User | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date
}

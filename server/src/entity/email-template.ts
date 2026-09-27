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
import { Column, Entity, ManyToOne, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { User } from "./user"

// Only customised templates have a row; the built-in default applies otherwise.
@Entity('email_templates')
export class EmailTemplate {
	@PrimaryColumn({ type: 'varchar', length: 64 })
	key: string

	@Column({ type: 'text' })
	subject: string

	@Column({ type: 'text', default: '' })
	preheader: string

	@Column({ type: 'text', default: '' })
	heading: string

	@Column({ type: 'text' })
	bodyHtml: string

	@Column({ type: 'text', default: '' })
	buttonLabel: string

	@Column({ type: 'uuid', nullable: true })
	updatedById: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	updatedBy: User | null

	@UpdateDateColumn()
	updatedAt: Date
}

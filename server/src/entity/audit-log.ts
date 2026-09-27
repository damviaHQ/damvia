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
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm"
import { User } from "./user"

@Entity('audit_log')
export class AuditLog {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date

	@Column({ type: 'varchar', nullable: true })
	actorId: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	actor: User | null

	// The actor's email when the event happened, so the entry still reads
	// after the account is renamed.
	@Column({ type: 'varchar', nullable: true })
	actorLabel: string | null

	@Column()
	action: string

	@Column()
	targetType: string

	@Column({ type: 'varchar', nullable: true })
	targetId: string | null

	@Column({ type: 'jsonb', nullable: true })
	before: unknown

	@Column({ type: 'jsonb', nullable: true })
	after: unknown

	@Column({ type: 'varchar', nullable: true })
	ip: string | null

	@Column({ type: 'varchar', nullable: true })
	userAgent: string | null
}

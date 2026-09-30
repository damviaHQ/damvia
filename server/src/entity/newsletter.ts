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
import { Audience, AudienceFilter } from "./audience"
import { User } from "./user"

export enum NewsletterStatus {
	DRAFT = 'draft',
	SCHEDULED = 'scheduled',
	SENDING = 'sending',
	SENT = 'sent',
}

@Entity('newsletters')
export class Newsletter {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	// Only admins see it; recipients see the subject.
	@Column({ type: 'varchar', length: 120 })
	name: string

	@Column({ type: 'text', default: '' })
	subject: string

	@Column({ type: 'text', default: '' })
	preheader: string

	@Column({ type: 'text', default: '' })
	heading: string

	@Column({ type: 'text', default: '' })
	bodyHtml: string

	// The saved audience it was built from, if any. The filter is a copy, so
	// changing that audience later never changes who a sent newsletter reached.
	@Column({ type: 'uuid', nullable: true })
	audienceId: string | null

	@ManyToOne(() => Audience, { onDelete: 'SET NULL' })
	audience: Audience | null

	@Column({ type: 'jsonb' })
	filter: AudienceFilter

	@Column({ type: 'varchar', length: 16, default: NewsletterStatus.DRAFT })
	status: NewsletterStatus

	@Column({ type: 'timestamptz', nullable: true })
	scheduledAt: Date | null

	@Column({ type: 'timestamptz', nullable: true })
	startedAt: Date | null

	@Column({ type: 'timestamptz', nullable: true })
	sentAt: Date | null

	@Column({ type: 'uuid', nullable: true })
	createdById: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	createdBy: User | null

	@Column({ type: 'uuid', nullable: true })
	updatedById: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	updatedBy: User | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date
}

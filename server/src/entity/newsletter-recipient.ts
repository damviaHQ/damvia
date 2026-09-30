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
import { Column, Entity, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm"
import { Newsletter } from "./newsletter"
import { User } from "./user"

export enum NewsletterRecipientStatus {
	PENDING = 'pending',
	SENT = 'sent',
	FAILED = 'failed',
	// Unsubscribed, suspended or removed between the start and their turn.
	SKIPPED = 'skipped',
	// Sent, then reported back by the mail provider.
	BOUNCED = 'bounced',
	COMPLAINED = 'complained',
}

// Who a newsletter went to, frozen when sending starts.
@Entity('newsletter_recipients')
export class NewsletterRecipient {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({ type: 'uuid' })
	newsletterId: string

	@ManyToOne(() => Newsletter, { onDelete: 'CASCADE' })
	newsletter: Newsletter

	@Column({ type: 'uuid', nullable: true })
	userId: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	user: User | null

	@Column({ type: 'varchar' })
	email: string

	@Column({ type: 'varchar' })
	name: string

	@Column({ type: 'varchar', length: 16, default: NewsletterRecipientStatus.PENDING })
	status: NewsletterRecipientStatus

	@Column({ type: 'text', nullable: true })
	error: string | null

	@Column({ type: 'timestamptz', nullable: true })
	sentAt: Date | null
}

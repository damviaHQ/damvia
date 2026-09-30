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
import { Newsletter } from "./newsletter"
import { User } from "./user"

// An image placed in a newsletter. It is public: once sent, it is in inboxes.
@Entity('newsletter_images')
export class NewsletterImage {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({ type: 'varchar' })
	s3Key: string

	@Column({ type: 'varchar', length: 32 })
	contentType: string

	@Column({ type: 'int' })
	width: number

	@Column({ type: 'int' })
	height: number

	@Column({ type: 'uuid', nullable: true })
	newsletterId: string | null

	@ManyToOne(() => Newsletter, { onDelete: 'SET NULL' })
	newsletter: Newsletter | null

	@Column({ type: 'uuid', nullable: true })
	createdById: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	createdBy: User | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date
}

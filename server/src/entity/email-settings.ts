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

@Entity('email_settings')
export class EmailSettings {
	@PrimaryColumn({ type: 'int' })
	id: number

	// Empty falls back to APP_NAME.
	@Column({ type: 'varchar', length: 120, nullable: true })
	senderName: string | null

	// Empty falls back to no-reply at the APP_URL host.
	@Column({ type: 'varchar', length: 254, nullable: true })
	senderAddress: string | null

	@Column({ type: 'varchar', length: 254, nullable: true })
	replyTo: string | null

	// Printed under every email, such as the company name and postal address.
	@Column({ type: 'text', default: '' })
	footerText: string

	@UpdateDateColumn()
	updatedAt: Date
}

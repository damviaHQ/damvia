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

@Entity('brand_settings')
export class BrandSettings {
	@PrimaryColumn({ type: 'int' })
	id: number

	// A #rrggbb colour for buttons and links in emails and the client portal.
	// Empty keeps the Damvia defaults.
	@Column({ type: 'varchar', length: 7, nullable: true })
	accentColor: string | null

	// The name emails and the browser tab show. Empty falls back to APP_NAME.
	@Column({ type: 'varchar', length: 120, nullable: true })
	brandName: string | null

	@UpdateDateColumn()
	updatedAt: Date
}

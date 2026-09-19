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
import { AssetFile } from "./asset-file"
import { Collection } from "./collection"
import { User } from "./user"

export enum ActivityEventType {
	LOGIN = 'login',
	ASSET_VIEW = 'asset_view',
	ASSET_DOWNLOAD = 'asset_download',
	SEARCH = 'search',
	COLLECTION_SHARE = 'collection_share',
	FAVORITE = 'favorite',
}

@Entity('activity_events')
export class ActivityEvent {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({ type: 'varchar', nullable: true })
	userId: string | null

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	user: User | null

	@Column({ enum: ActivityEventType })
	type: ActivityEventType

	@Column({ type: 'varchar', nullable: true })
	assetFileId: string | null

	@ManyToOne(() => AssetFile, { onDelete: 'SET NULL' })
	assetFile: AssetFile | null

	@Column({ type: 'varchar', nullable: true })
	collectionId: string | null

	@ManyToOne(() => Collection, { onDelete: 'SET NULL' })
	collection: Collection | null

	@Column({ type: 'jsonb', default: {} })
	metadata: Record<string, unknown>

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date
}

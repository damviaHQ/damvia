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
import {
	Column,
	CreateDateColumn,
	Entity,
	ManyToOne,
	PrimaryColumn,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from "typeorm"
import { User } from "./user"

export enum DownloadStatus {
	PREPARING = 'preparing',
	READY = 'ready',
	EXPIRED = 'expired',
}

export enum DownloadType {
	DIRECT = 'direct',
	EMAIL = 'email',
}

export enum DownloadImageFormat {
	ORIGINAL = 'original',
	PNG = 'png',
	JPG = 'jpg',
	WEBP = 'webp',
}

export enum DownloadImageResolution {
	HIGH = 'high',
	MEDIUM = 'medium',
	LOW = 'low',
}

export enum DownloadVideoFormat {
	ORIGINAL = 'original',
	MP4 = 'mp4',
	WEBM = 'webm',
}

export enum DownloadVideoResolution {
	HIGH = 'high',
	MEDIUM = 'medium',
	LOW = 'low',
}

@Entity('downloads')
export class Download {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	userId: string

	@ManyToOne(() => User)
	user: User

	@Column({ type: 'uuid', array: true, default: [] })
	collectionFileIds: string[]

	@Column({ enum: DownloadStatus })
	status: DownloadStatus

	@Column({ enum: DownloadType })
	type: DownloadType

	@Column({ enum: DownloadImageFormat })
	imageFormat: DownloadImageFormat

	@Column({ enum: DownloadImageResolution })
	imageResolution: DownloadImageResolution

	@Column({ enum: DownloadVideoFormat })
	videoFormat: DownloadVideoFormat

	@Column({ enum: DownloadVideoResolution })
	videoResolution: DownloadVideoResolution

	@Column()
	expiresAt: Date

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date

	get storageKey() {
		return `downloads/${this.id}`
	}
}

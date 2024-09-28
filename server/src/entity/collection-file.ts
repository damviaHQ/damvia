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
	JoinColumn,
	ManyToOne, OneToMany,
	PrimaryColumn,
	PrimaryGeneratedColumn, Unique,
	UpdateDateColumn
} from "typeorm"
import { AssetFile } from "./asset-file"
import { Collection } from "./collection"
import { UserFavorite } from "./user-favorite"

@Entity('collection_files')
@Unique('idx_collection_id_asset_id', ['collectionId', 'assetFileId'])
export class CollectionFile {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	assetFileId: string

	@ManyToOne(() => AssetFile, (r) => r.collectionFiles)
	@JoinColumn()
	assetFile: AssetFile

	@Column()
	collectionId: string

	@ManyToOne(() => Collection, (r) => r.files, { onDelete: 'CASCADE' })
	@JoinColumn()
	collection: Collection

	@OneToMany(() => UserFavorite, (userFavorite) => userFavorite.collectionFile)
	favorites: UserFavorite[]

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

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
import { CreateDateColumn, Entity, ManyToOne, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { CollectionFile } from "./collection-file"
import { User } from "./user"

@Entity('user_favorites')
export class UserFavorite {
	@PrimaryColumn()
	userId: string

	@ManyToOne(() => User, (user) => user.favorites, { onDelete: 'CASCADE' })
	user: User

	@PrimaryColumn()
	collectionFileId: string

	@ManyToOne(() => CollectionFile, { onDelete: 'CASCADE' })
	collectionFile: CollectionFile

	@CreateDateColumn()
	createdAt: Date

	@UpdateDateColumn()
	updatedAt: Date
}

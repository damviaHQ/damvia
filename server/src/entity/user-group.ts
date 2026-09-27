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
import {Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn} from "typeorm"
import {User} from "./user";
import {Group} from "./group";

@Entity('user_groups')
export class UserGroup {
	@PrimaryColumn()
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column()
	userId: string

	@ManyToOne(() => User, (user) => user.userGroups, { onDelete: 'CASCADE' })
	user: User

	@Column()
	groupId: string

	@ManyToOne(() => Group, (group) => group.userGroups, { onDelete: 'CASCADE' })
	group: Group

	@CreateDateColumn()
	createdAt: Date
}

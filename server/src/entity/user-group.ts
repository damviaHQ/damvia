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

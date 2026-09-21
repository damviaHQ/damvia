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
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

export const RECORD_VALUE_TYPES = ['text', 'long_text', 'number', 'date', 'single_select', 'multi_select', 'url'] as const
export type RecordValueType = typeof RECORD_VALUE_TYPES[number]

@Entity('record_attributes')
export class RecordAttribute {
    @PrimaryColumn()
    @PrimaryGeneratedColumn("uuid")
    id: string

    @Column({ unique: true })
    name: string

    @Column({ type: 'varchar', nullable: true })
    displayName: string | null

    @Column({ type: 'varchar', default: 'text' })
    valueType: RecordValueType

    @Column('text', { array: true, default: '{}' })
    options: string[]

    @Column({ type: 'int', default: 0 })
    position: number

    @Column({ default: false })
    facetable: boolean

    @Column({ default: false })
    @Index()
    searchable: boolean

    @Column({ default: false })
    viewable: boolean

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}

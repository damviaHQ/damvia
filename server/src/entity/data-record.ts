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
    OneToMany,
    PrimaryColumn,
    PrimaryGeneratedColumn,
    UpdateDateColumn
} from "typeorm"
import { AssetFile } from "./asset-file"

@Entity('records')
export class DataRecord {
    @PrimaryColumn()
    @PrimaryGeneratedColumn("uuid")
    id: string

    @Column({ unique: true })
    recordKey: string // Stores the value of the primary key. Example "078998-777-M"

    @Column()
    keyColumnName: string // Stores the name of the column that is the primary key. Example "Product SKU"

    // Set by the database to the first table when left out.
    @Column({ type: 'uuid' })
    tableId: string

    @Column('hstore', { hstoreType: 'object', nullable: true })
    metaData: Record<string, string>

    @OneToMany(() => AssetFile, (assetFile) => assetFile.record)
    assetFiles: AssetFile[]

    // Written by the catalogue stage: how much of what an administrator
    // requires this record carries. Nothing required reads as ready.
    @Column({ default: 0, update: false, insert: false })
    readinessFilled: number

    @Column({ default: 0, update: false, insert: false })
    readinessTotal: number

    @Column({ default: true, update: false, insert: false })
    readinessReady: boolean

    // The model this product belongs to, normalised for grouping, and the
    // value as an administrator typed it.
    @Column({ type: 'text', nullable: true, update: false, insert: false })
    familyKey: string | null

    @Column({ type: 'text', nullable: true, update: false, insert: false })
    familyLabel: string | null

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}

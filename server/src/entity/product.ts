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

@Entity('products')
export class Product {
    @PrimaryColumn()
    @PrimaryGeneratedColumn("uuid")
    id: string

    @Column({ unique: true })
    productKey: string // Stores the value of the primary key. Example "078998-777-M"

    @Column()
    primaryKeyName: string // Stores the name of the column that is the primary key. Example "Product SKU"

    @Column('hstore', { hstoreType: 'object', nullable: true })
    metaData: Record<string, string>

    @OneToMany(() => AssetFile, (assetFile) => assetFile.product)
    assetFiles: AssetFile[]

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}

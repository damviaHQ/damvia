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
import { MigrationInterface, QueryRunner } from 'typeorm'

// Products become records: the catalogue can describe events, venues or
// anything a file is about, with a label the admin chooses. Renames only;
// no row is rewritten except the list column ids that carried the old prefix.
export class Records1790553600000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE products RENAME TO records;
            ALTER TABLE records RENAME COLUMN product_key TO record_key;
            ALTER TABLE records RENAME COLUMN primary_key_name TO key_column_name;
            ALTER TABLE product_attributes RENAME TO record_attributes;
            ALTER TABLE asset_files RENAME COLUMN product_id TO record_id;
            ALTER TABLE asset_files RENAME COLUMN product_view TO record_view;
            ALTER TABLE asset_types RENAME COLUMN is_related_to_products TO is_related_to_records;
            UPDATE asset_types SET list_display_items = array(SELECT replace(item, 'product_attribute.', 'record_attribute.') FROM unnest(list_display_items) AS item)
                WHERE 'product_attribute.' = ANY(array(SELECT left(item, 18) FROM unnest(list_display_items) AS item));
            CREATE TABLE enrichment_settings (
                id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                record_label_singular varchar NOT NULL DEFAULT 'Product',
                record_label_plural varchar NOT NULL DEFAULT 'Products',
                updated_at timestamp NOT NULL DEFAULT now()
            );
            INSERT INTO enrichment_settings DEFAULT VALUES;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE enrichment_settings;
            UPDATE asset_types SET list_display_items = array(SELECT replace(item, 'record_attribute.', 'product_attribute.') FROM unnest(list_display_items) AS item)
                WHERE 'record_attribute.' = ANY(array(SELECT left(item, 17) FROM unnest(list_display_items) AS item));
            ALTER TABLE asset_types RENAME COLUMN is_related_to_records TO is_related_to_products;
            ALTER TABLE asset_files RENAME COLUMN record_view TO product_view;
            ALTER TABLE asset_files RENAME COLUMN record_id TO product_id;
            ALTER TABLE record_attributes RENAME TO product_attributes;
            ALTER TABLE records RENAME COLUMN key_column_name TO primary_key_name;
            ALTER TABLE records RENAME COLUMN record_key TO product_key;
            ALTER TABLE records RENAME TO products;
        `)
    }
}

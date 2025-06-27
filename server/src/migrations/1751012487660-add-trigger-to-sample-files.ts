import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTriggerToSampleFiles1751012487660 implements MigrationInterface {
    name = 'AddTriggerToSampleFiles1751012487660'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            create function refresh_collection_sample_files_from_asset_files() returns trigger
                language plpgsql
            as
            $$
            BEGIN
                UPDATE collections
                SET sample_file_ids = coalesce((
                    SELECT ARRAY_AGG(subquery.id)
                    FROM (
                        SELECT collection_files.id
                        FROM collection_files
                        INNER JOIN collections collection_file_collection ON collections.id::text = ANY(string_to_array(collection_file_collection.mpath, '.'))
                        INNER JOIN asset_files ON collection_files.asset_file_id = asset_files.id AND asset_files.has_thumbnail
                        WHERE collection_files.collection_id = collections.id
                        ORDER BY array_position(string_to_array(collections.mpath, '.'), collection_files.collection_id::text) NULLS LAST, collection_files.created_at
                        LIMIT 4
                    ) AS subquery
                ), ARRAY[]::uuid[])
                WHERE collections.id::text IN (
                    SELECT unnest(string_to_array(current.mpath, '.'))
                    FROM collections current
                    WHERE current.id IN (
                        SELECT collection_files.collection_id
                        FROM collection_files
                        WHERE collection_files.asset_file_id = NEW.id
                        GROUP BY collection_files.collection_id
                    )
                );
                RETURN NEW;
            END;
            $$;
            
            create trigger refresh_collection_sample_files_from_asset_files_on_insert
                after insert
                on asset_files
                for each row
            execute procedure refresh_collection_sample_files_from_asset_files();

            create trigger refresh_collection_sample_files_from_asset_files_on_update
                after update
                on asset_files
                for each row
            execute procedure refresh_collection_sample_files_from_asset_files();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            drop trigger if exists refresh_collection_sample_files_from_asset_files_on_insert on asset_files;
            drop trigger if exists refresh_collection_sample_files_from_asset_files_on_update on asset_files;
            drop function if exists refresh_collection_sample_files_from_asset_files;
        `);
    }

}

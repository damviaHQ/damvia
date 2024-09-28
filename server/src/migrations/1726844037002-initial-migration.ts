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
import { MigrationInterface, QueryRunner } from "typeorm"

export class InitialMigration1726844037002 implements MigrationInterface {
    name = 'InitialMigration1726844037002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            create table groups
            (
                id         uuid      default uuid_generate_v4() not null
                    constraint "PK_659d1483316afb28afd3a90646e"
                        primary key,
                name       varchar                              not null,
                "default"  boolean   default false              not null,
                created_at timestamp default now()              not null,
                updated_at timestamp default now()              not null
            );

            create table authorized_domains
            (
                id         uuid      default uuid_generate_v4() not null
                    constraint "PK_13988795deaf0578cb24ea61ace"
                        primary key,
                domain     varchar                              not null,
                detail     varchar,
                created_at timestamp default now()              not null,
                updated_at timestamp default now()              not null
            );

            create table regions
            (
                id               uuid      default uuid_generate_v4() not null
                    constraint "PK_4fcd12ed6a046276e2deb08801c"
                        primary key,
                name             varchar                              not null,
                default_group_id uuid                                 not null
                    constraint "FK_62191873f4c4a782d2871d1ff33"
                        references groups,
                created_at       timestamp default now()              not null,
                updated_at       timestamp default now()              not null
            );

            create table users
            (
                id                      uuid      default uuid_generate_v4()         not null
                    constraint "PK_a3ffb1c0c8416b9fc6f907b7433"
                        primary key,
                name                    varchar                                      not null,
                company                 varchar                                      not null,
                email                   varchar                                      not null
                    constraint "UQ_97672ac88f789774dd47f7c8be3"
                        unique,
                email_verified          boolean   default false                      not null,
                password                varchar,
                role                    varchar   default 'guest'::character varying not null,
                approved                boolean   default false                      not null,
                group_id                uuid                                         not null
                    constraint "FK_b8d62b3714f81341caa13ab0ff0"
                        references groups,
                region_id               uuid                                         not null
                    constraint "FK_1901e9aae03c8897b7dd460c27f"
                        references regions,
                email_verification_code varchar,
                created_at              timestamp default now()                      not null,
                updated_at              timestamp default now()                      not null,
                reset_password_token    varchar
            );

            create table asset_types
            (
                id                           uuid      default uuid_generate_v4()        not null
                    constraint "PK_2cf0314bcc4351b7f2827d57edb"
                        primary key,
                name                         varchar                                     not null,
                description                  varchar,
                created_at                   timestamp default now()                     not null,
                updated_at                   timestamp default now()                     not null,
                is_related_to_products       boolean   default false                     not null,
                include_in_search_by_default boolean   default false                     not null,
                default_display              varchar   default 'grid'::character varying not null,
                list_display_items           text[]    default '{}'::text[]              not null
            );

            create table licenses
            (
                id                 uuid      default uuid_generate_v4() not null
                    constraint "PK_f168ac1ca5ba87286d03b2ef905"
                        primary key,
                name               varchar                              not null,
                usage_from         date                                 not null,
                usage_to           date                                 not null,
                scopes             text[]                               not null,
                created_at         timestamp default now()              not null,
                updated_at         timestamp default now()              not null,
                allowed_region_ids uuid[]    default '{}'::uuid[]       not null
            );

            create table asset_folders
            (
                id            uuid      default uuid_generate_v4() not null
                    constraint "PK_1c895f55a2bc27a26a8a6aeefda"
                        primary key,
                name          varchar                              not null,
                external_id   varchar                              not null
                    constraint "UQ_d1bbe796866f2b68f2061fa2d6d"
                        unique,
                parent_id     uuid
                    constraint "FK_bbc7f7799c7339e62876b41d080"
                        references asset_folders,
                created_at    timestamp default now()              not null,
                updated_at    timestamp default now()              not null,
                status        varchar                              not null,
                mpath         varchar   default ''::character varying,
                asset_type_id uuid
                    constraint "FK_56ab5a5dde61ba66b5ff8870101"
                        references asset_types,
                license_id    uuid
                    constraint "FK_0a4fce77cd735d8e92dd7f95d85"
                        references licenses
            );

            create table collections
            (
                id              uuid      default uuid_generate_v4() not null
                    constraint "PK_21c00b1ebbd41ba1354242c5c4e"
                        primary key,
                name            varchar                              not null,
                description     varchar,
                public          boolean                              not null,
                draft           boolean                              not null,
                asset_folder_id uuid
                    constraint "FK_beb8e4c77c2ebcce126d6069f98"
                        references asset_folders,
                parent_id       uuid
                    constraint "FK_0f812cc4eb3b50276468bb4a1a7"
                        references collections
                        on delete cascade,
                created_at      timestamp default now()              not null,
                updated_at      timestamp default now()              not null,
                mpath           varchar   default ''::character varying,
                owner_id        uuid
                    constraint "FK_d910810b3fbbd3745a925bcd6c6"
                        references users,
                number_of_files integer   default 0                  not null,
                sample_file_ids uuid[]    default '{}'::uuid[]       not null,
                has_thumbnail   boolean   default false              not null,
                constraint idx_parent_id_name
                    unique (parent_id, name)
            );

            create index "IDX_52c05003c86b75050581e20f00"
                on collections (public);

            create index "IDX_73757c75353edda16f819c5290"
                on collections (draft);

            create index "IDX_beb8e4c77c2ebcce126d6069f9"
                on collections (asset_folder_id);

            create index "IDX_0f812cc4eb3b50276468bb4a1a"
                on collections (parent_id);

            create index "IDX_d910810b3fbbd3745a925bcd6c"
                on collections (owner_id);

            create table products
            (
                id               uuid      default uuid_generate_v4() not null
                    constraint "PK_bebc9158e480b949565b4dc7a82"
                        primary key,
                product_key      varchar                              not null
                    constraint "UQ_b407dfee87b12a90f88a3e15429"
                        unique,
                primary_key_name varchar                              not null,
                meta_data        hstore,
                created_at       timestamp default now()              not null,
                updated_at       timestamp default now()              not null
            );

            create table asset_files
            (
                id                uuid      default uuid_generate_v4() not null
                    constraint "PK_c41dc3e9ef5e1c57ca5a08a0004"
                        primary key,
                name              varchar                              not null,
                external_id       varchar                              not null
                    constraint "UQ_bead8e0de20330fa86534a1c6ab"
                        unique,
                external_checksum varchar                              not null,
                size              bigint                               not null,
                mime_type         varchar                              not null,
                folder_id         uuid                                 not null
                    constraint "FK_967a7d6e5650129c72951ca2f64"
                        references asset_folders,
                created_at        timestamp default now()              not null,
                updated_at        timestamp default now()              not null,
                has_thumbnail     boolean   default false              not null,
                status            varchar                              not null,
                asset_type_id     uuid
                    constraint "FK_acc19280874a9be7e55f6f0b9ea"
                        references asset_types,
                license_id        uuid
                    constraint "FK_af13e660f8a5cab27df8cc02209"
                        references licenses,
                product_id        uuid
                    constraint "FK_a10d7bf0bd2d3c877e80277af56"
                        references products,
                product_view      varchar,
                height            integer,
                width             integer
            );

            create table collection_files
            (
                id            uuid      default uuid_generate_v4() not null
                    constraint "PK_a7e4cd371e3805f8feea23b075d"
                        primary key,
                asset_file_id uuid                                 not null
                    constraint "FK_00e72ec185cbc2643731f53db74"
                        references asset_files,
                collection_id uuid                                 not null
                    constraint "FK_fffc44b69de10465492190cd58b"
                        references collections
                        on delete cascade,
                created_at    timestamp default now()              not null,
                updated_at    timestamp default now()              not null,
                constraint idx_collection_id_asset_id
                    unique (collection_id, asset_file_id)
            );

            create table user_favorites
            (
                user_id            uuid                    not null
                    constraint "FK_5238ce0a21cc77dc16c8efe3d36"
                        references users
                        on delete cascade,
                collection_file_id uuid                    not null
                    constraint "FK_124df8f5122f67d1c53a82013a2"
                        references collection_files
                        on delete cascade,
                created_at         timestamp default now() not null,
                updated_at         timestamp default now() not null,
                constraint "PK_6b0e41dda4c0fb995c93c13f2da"
                    primary key (user_id, collection_file_id)
            );

            create table downloads
            (
                id                  uuid      default uuid_generate_v4() not null
                    constraint "PK_60f7fa2aa9b7138737ab957a436"
                        primary key,
                user_id             uuid                                 not null
                    constraint "FK_b63bbc96bc5056e8b85ce020a4b"
                        references users,
                status              varchar                              not null,
                type                varchar                              not null,
                image_format        varchar                              not null,
                image_resolution    varchar                              not null,
                video_format        varchar                              not null,
                video_resolution    varchar                              not null,
                created_at          timestamp default now()              not null,
                updated_at          timestamp default now()              not null,
                expires_at          timestamp                            not null,
                collection_file_ids uuid[]    default '{}'::uuid[]       not null
            );

            create table collection_invitations
            (
                id            uuid      default uuid_generate_v4() not null
                    constraint "PK_c71b85c3cc89f6ed04040b70545"
                        primary key,
                collection_id uuid                                 not null
                    constraint "FK_05a3624f1611c5fd99dabaa6d5b"
                        references collections
                        on delete cascade,
                email         varchar                              not null,
                user_id       uuid
                    constraint "FK_4c30972425047f2c434ba2da070"
                        references users
                        on delete cascade,
                expires_at    date                                 not null,
                created_at    timestamp default now()              not null,
                updated_at    timestamp default now()              not null
            );

            create table product_attributes
            (
                id           uuid      default uuid_generate_v4() not null
                    constraint "PK_4fa18fc5c893cb9894fc40ca921"
                        primary key,
                name         varchar                              not null
                    constraint "UQ_595092a61bcace8d8c5797d5a99"
                        unique,
                display_name varchar,
                facetable    boolean   default false              not null,
                viewable     boolean   default false              not null,
                created_at   timestamp default now()              not null,
                updated_at   timestamp default now()              not null
            );

            create table pages
            (
                id            uuid      default uuid_generate_v4() not null
                    constraint "PK_8f21ed625aa34c8391d636b7d3b"
                        primary key,
                name          varchar,
                collection_id uuid
                    constraint "REL_8e65e2760896c7c430f04f907b"
                        unique
                    constraint "FK_8e65e2760896c7c430f04f907bd"
                        references collections
                        on delete cascade,
                created_at    timestamp default now()              not null,
                updated_at    timestamp default now()              not null
            );

            create table page_blocks
            (
                id         uuid      default uuid_generate_v4() not null
                    constraint "PK_12e1906637520fdf81ad29ac66b"
                        primary key,
                type       varchar                              not null,
                "column"   integer                              not null,
                row        integer                              not null,
                width      integer                              not null,
                data       text,
                created_at timestamp default now()              not null,
                updated_at timestamp default now()              not null,
                page_id    uuid                                 not null
                    constraint "FK_ad019765c7ffab9084d1d215d48"
                        references pages
                        on delete cascade
            );

            create table menu_items
            (
                id            uuid      default uuid_generate_v4() not null
                    constraint "PK_57e6188f929e5dc6919168620c8"
                        primary key,
                type          varchar                              not null,
                position      integer                              not null,
                data          text,
                collection_id uuid
                    constraint "FK_bb6d138e1ee396ed8649ea3f829"
                        references collections
                        on delete cascade,
                mpath         varchar   default ''::character varying,
                parent_id     uuid
                    constraint "FK_8e20ca40202c116fdafe92cdc4e"
                        references menu_items
                        on delete cascade,
                created_at    timestamp default now()              not null,
                updated_at    timestamp default now()              not null,
                page_id       uuid
                    constraint "FK_d15d1b5421f983c49390a68d4f9"
                        references pages
                        on delete cascade,
                home          boolean   default false              not null
            );

            create unique index "IDX_560802d28e3563627ca2d19592"
                on pages (collection_id)
                where (collection_id IS NOT NULL);

            create function refresh_collection_number_of_files_on_insert() returns trigger
                language plpgsql
            as
            $$
            BEGIN
                UPDATE collections
                SET number_of_files = coalesce(number_of_files, 0) + 1
                WHERE id::text = ANY(
                    SELECT unnest(string_to_array(current.mpath, '.'))
                    FROM collections current
                    WHERE current.id = NEW.collection_id
                );
                RETURN NEW;
            END;
            $$;

            create function refresh_collection_number_of_files_on_delete() returns trigger
                language plpgsql
            as
            $$
            BEGIN
                UPDATE collections
                SET number_of_files = coalesce(number_of_files, 0) - 1
                WHERE id::text = ANY(
                    SELECT unnest(string_to_array(current.mpath, '.'))
                    FROM collections current
                    WHERE current.id = OLD.collection_id
                );
                RETURN OLD;
            END;
            $$;

            create function refresh_collection_sample_files() returns trigger
                language plpgsql
            as
            $$
            BEGIN
                UPDATE collections
                SET sample_file_ids = coalesce((
                                                   SELECT ARRAY_AGG(subquery.id)
                                                   FROM (
                                                            SELECT collection_files.id
                                                            FROM collections AS c
                                                                     INNER JOIN collections collection_file_collection ON collections.id::text = ANY(string_to_array(collection_file_collection.mpath, '.'))
                                                                     INNER JOIN collection_files ON collection_files.collection_id = collection_file_collection.id
                                                                     INNER JOIN asset_files ON collection_files.asset_file_id = asset_files.id AND asset_files.has_thumbnail
                                                            WHERE c.id = NEW.collection_id
                                                            ORDER BY array_position(string_to_array(collections.mpath, '.'), collection_files.collection_id::text) NULLS LAST, collection_files.created_at
                                                            LIMIT 4
                                                        ) AS subquery
                                               ), ARRAY[]::uuid[])
                WHERE collections.id::text = ANY(string_to_array((
                                                                     SELECT current.mpath
                                                                     FROM collections current
                                                                     WHERE current.id = NEW.collection_id
                                                                 ), '.'));
                RETURN NEW;
            END;
            $$;

            INSERT INTO groups (name, "default") VALUES ('Default', TRUE);

            INSERT INTO regions (name, default_group_id) VALUES ('Global', (SELECT id FROM groups LIMIT 1));


            create trigger refresh_collection_number_of_files_on_insert
                after insert
                on collection_files
                for each row
            execute procedure refresh_collection_number_of_files_on_insert();

            create trigger refresh_collection_number_of_files_on_delete
                after delete
                on collection_files
                for each row
            execute procedure refresh_collection_number_of_files_on_delete();

            create trigger refresh_collection_sample_files_on_insert
                after insert
                on collection_files
                for each row
            execute procedure refresh_collection_sample_files();

            create trigger refresh_collection_sample_files_on_update
                after update
                on collection_files
                for each row
            execute procedure refresh_collection_sample_files();
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }

}

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

// Each enrichment pass leaves a row: who started it, when, how long it took,
// what each stage changed or the error that stopped it. The overview reads
// the latest; the pass keeps the last 50.
export class EnrichmentRuns1790899200000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE enrichment_runs (
                id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                trigger varchar NOT NULL,
                started_by_id uuid REFERENCES users ON DELETE SET NULL,
                started_at timestamp NOT NULL DEFAULT now(),
                finished_at timestamp,
                stats jsonb,
                error text
            );
            CREATE INDEX idx_enrichment_runs_started_at ON enrichment_runs (started_at DESC);
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE enrichment_runs')
    }
}

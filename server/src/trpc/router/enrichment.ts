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
import { dataSource, logger } from "../../env"
import { isEnrichmentRunning, runEnrichmentPass } from "../../services/enrichment"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

type RunRow = { id: string, trigger: string, started_by: string | null, started_at: Date, finished_at: Date | null, stats: Record<string, unknown> | null, error: string | null }

const formatRun = (row: RunRow | undefined) => row ? {
	id: row.id,
	trigger: row.trigger,
	startedBy: row.started_by,
	startedAt: row.started_at,
	finishedAt: row.finished_at,
	durationMs: row.finished_at ? new Date(row.finished_at).getTime() - new Date(row.started_at).getTime() : null,
	stats: row.stats,
	error: row.error,
} : null

export default router({
	overview: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const [counts] = await dataSource.query(`
				SELECT
					(SELECT count(*) FROM asset_folders WHERE asset_type_source = 'rule')::int AS folders_by_rule,
					(SELECT count(*) FROM asset_folders WHERE asset_type_source = 'manual')::int AS folders_by_hand,
					(SELECT count(*) FROM asset_folders WHERE asset_type_source = 'inherited')::int AS folders_inherited,
					(SELECT count(*) FROM asset_folders WHERE asset_type_id IS NULL)::int AS folders_untyped,
					(SELECT count(*) FROM asset_file_resolutions WHERE status = 'matched')::int AS files_matched,
					(SELECT count(*) FROM asset_file_resolutions WHERE status = 'unmatched')::int AS files_unmatched,
					(SELECT count(*) FROM asset_file_resolutions WHERE status = 'conflict')::int AS files_in_conflict,
					(SELECT count(*) FROM variant_groups)::int AS variant_groups,
					(SELECT count(*) FROM variant_axes a WHERE a.name IS NULL AND NOT a.ignored)::int AS unnamed_axes,
					(SELECT count(*) FROM asset_folders)::int AS folders
			`)
			const runs: RunRow[] = await dataSource.query(`
				SELECT r.id, r.trigger, u.name AS started_by, r.started_at, r.finished_at, r.stats, r.error
				FROM enrichment_runs r LEFT JOIN users u ON u.id = r.started_by_id ORDER BY r.started_at DESC LIMIT 2
			`)
			const running = await isEnrichmentRunning()
			return {
				synced: counts.folders > 0,
				folders: { byRule: counts.folders_by_rule, byHand: counts.folders_by_hand, inherited: counts.folders_inherited, untyped: counts.folders_untyped },
				files: { matched: counts.files_matched, unmatched: counts.files_unmatched, conflicts: counts.files_in_conflict },
				variantGroups: counts.variant_groups,
				unnamedAxes: counts.unnamed_axes,
				running: running ? formatRun(runs.find((run) => !run.finished_at)) ?? { id: null, trigger: 'admin', startedBy: null, startedAt: null, finishedAt: null, durationMs: null, stats: null, error: null } : null,
				lastRun: formatRun(runs.find((run) => run.finished_at)),
			}
		}),
	// Starts a pass without waiting for it. While one runs, the new one waits
	// on the lock and runs next.
	run: publicProcedure
		.use(authMiddleware(userAdmin))
		.mutation(async ({ ctx }) => {
			const queued = await isEnrichmentRunning()
			runEnrichmentPass('admin', ctx.user.id).catch((error) => logger.error('failed to run enrichment pass', { error }))
			return { queued }
		}),
	badges: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const [row] = await dataSource.query(`
				SELECT
					(SELECT count(*) FROM asset_file_resolutions WHERE status IN ('unmatched', 'conflict'))::int AS unmatched,
					(SELECT count(*) FROM variant_axes a WHERE a.name IS NULL AND NOT a.ignored AND EXISTS (SELECT 1 FROM variant_group_axes ga WHERE ga.variant_axis_id = a.id))::int AS unnamed_axes
			`)
			return { unmatched: row.unmatched as number, unnamedAxes: row.unnamed_axes as number }
		}),
})

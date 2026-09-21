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
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { VariantAxis } from "../../entity/variant-axis"
import { VariantGroupingSettings } from "../../entity/variant-grouping-settings"
import { dataSource } from "../../env"
import { rerunVariantStage } from "../../services/enrichment"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"

type AxisRow = { id: string, name: string | null, values: string[], recognizer: string | null, ignored: boolean, example_file_names: string[], groups: number, created_at: Date }

// Unnamed axes read "Variant 1", "Variant 2"… in the order they were found,
// the same numbering everywhere.
async function loadAxes(): Promise<(AxisRow & { label: string })[]> {
	const rows: AxisRow[] = await dataSource.query(`
		SELECT a.id, a.name, a."values", a.recognizer, a.ignored, a.example_file_names, a.created_at,
			(SELECT count(DISTINCT ga.variant_group_id)::int FROM variant_group_axes ga WHERE ga.variant_axis_id = a.id) AS groups
		FROM variant_axes a ORDER BY a.created_at, a.id
	`)
	let unnamed = 0
	return rows.map((row) => ({ ...row, label: row.name ?? `Variant ${++unnamed}` }))
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => (await loadAxes()).map((axis) => ({
			id: axis.id,
			name: axis.name,
			label: axis.label,
			values: axis.values,
			recognizer: axis.recognizer,
			ignored: axis.ignored,
			examples: axis.example_file_names,
			groups: axis.groups,
		}))),
	rename: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ id: z.uuid(), name: z.string().trim().max(60).nullable() }))
		.mutation(async ({ input }) => {
			const axis = await dataSource.getRepository(VariantAxis).findOneBy({ id: input.id })
			if (!axis) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Axis not found.' })
			}
			axis.name = input.name || null
			await dataSource.getRepository(VariantAxis).save(axis)
			return { id: axis.id, name: axis.name }
		}),
	// The only way values grow: the admin merges an axis into another, which
	// takes the union of the values and the groups of both.
	merge: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ fromId: z.uuid(), intoId: z.uuid() }))
		.mutation(async ({ input }) => {
			if (input.fromId === input.intoId) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose another axis to merge into.' })
			}
			await dataSource.transaction(async (em) => {
				const from = await em.getRepository(VariantAxis).findOneBy({ id: input.fromId })
				const into = await em.getRepository(VariantAxis).findOneBy({ id: input.intoId })
				if (!from || !into) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Axis not found.' })
				}
				into.values = [...new Set([...into.values, ...from.values])].sort()
				await em.getRepository(VariantAxis).save(into)
				await em.query('UPDATE variant_group_axes SET variant_axis_id = $2 WHERE variant_axis_id = $1', [from.id, into.id])
				await em.getRepository(VariantAxis).remove(from)
			})
			return rerunVariantStage()
		}),
	ignore: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ id: z.uuid(), ignored: z.boolean() }))
		.mutation(async ({ input }) => {
			const updated = await dataSource.getRepository(VariantAxis).update({ id: input.id }, { ignored: input.ignored })
			if (!updated.affected) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Axis not found.' })
			}
			return { id: input.id, ignored: input.ignored }
		}),
	listFacets: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async () => (await loadAxes()).filter((axis) => !axis.ignored && axis.groups > 0).map((axis) => ({ id: axis.id, label: axis.label, values: axis.values }))),
	settings: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const settings = await dataSource.getRepository(VariantGroupingSettings).findOneByOrFail({ id: 1 })
			return { minPrefixLength: settings.minPrefixLength, blockedTokens: settings.blockedTokens }
		}),
	updateSettings: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			minPrefixLength: z.number().int().min(1).max(40),
			blockedTokens: z.string().trim().toLowerCase().min(1).max(40).regex(/^[^\s_.-]+$/, 'A blocked word has no space, dot, dash or underscore.').array().max(200),
		}))
		.mutation(async ({ input }) => {
			await dataSource.getRepository(VariantGroupingSettings).update({ id: 1 }, { minPrefixLength: input.minPrefixLength, blockedTokens: [...new Set(input.blockedTokens)] })
			return rerunVariantStage()
		}),
})

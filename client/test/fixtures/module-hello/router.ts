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
// The router of the hello module, as its server part would declare it. The
// client only imports its type, so moduleClient() calls are checked.
import type { ModuleApi } from "server/src/modules"
import { z } from "zod"

export function helloRouter(damvia: ModuleApi) {
	return damvia.router({
		list: damvia.publicProcedure.query((): { id: string, text: string }[] => []),
		add: damvia.publicProcedure.input(z.object({ text: z.string().min(1) })).mutation(({ input }) => ({ id: '', text: input.text })),
	})
}

export type HelloRouter = ReturnType<typeof helloRouter>

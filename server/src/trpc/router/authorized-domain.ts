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
import { AuthorizedDomain } from "../../entity/authorized-domain"
import { dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export function formatAuthorizedDomain(authorizedDomain: AuthorizedDomain) {
	return {
		id: authorizedDomain.id,
		domain: authorizedDomain.domain,
		detail: authorizedDomain.detail,
	}
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const authorizedDomains = await dataSource.getRepository(AuthorizedDomain).find()
			return authorizedDomains.map(formatAuthorizedDomain)
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				domain: z.string().min(1).max(80),
				detail: z.string().max(255),
			}),
		)
		.mutation(async ({ input }) => {
			const authorizedDomain = new AuthorizedDomain()
			authorizedDomain.domain = input.domain
			authorizedDomain.detail = input.detail
			await dataSource.getRepository(AuthorizedDomain).save(authorizedDomain)
			return formatAuthorizedDomain(authorizedDomain)
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			const authorizedDomain = await dataSource.getRepository(AuthorizedDomain).findOneBy({ id: input })
			if (!authorizedDomain) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Authorized domain not found.' })
			}

			await dataSource.getRepository(AuthorizedDomain).remove(authorizedDomain)
		}),
})

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
import { mcpEnabled } from "../../env"
import { checkAuthorizationRequest, denyRequest, grantedScopes, issueCode, OAuthError, refusal } from "../../mcp/oauth"
import { recordAudit } from "../../services/audit"
import { authMiddleware, publicProcedure, router, userApproved } from "../index"

// The consent page where a person lets an AI assistant reach the library on
// their behalf. The assistant gets a code, then tokens, at /v1/oauth/token.
const request = z.object({
	response_type: z.string().max(50).optional(),
	client_id: z.string().max(100).optional(),
	redirect_uri: z.string().max(2000).optional(),
	code_challenge: z.string().max(200).optional(),
	code_challenge_method: z.string().max(20).optional(),
	state: z.string().max(1000).optional(),
	scope: z.string().max(1000).optional(),
	resource: z.string().max(2000).optional(),
})

function enabled() {
	if (!mcpEnabled()) throw new TRPCError({ code: 'NOT_FOUND', message: 'Assistants are not enabled on this library.' })
}

async function checked(input: z.infer<typeof request>) {
	try {
		return await checkAuthorizationRequest(input)
	} catch (error) {
		if (error instanceof OAuthError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.description })
		throw error
	}
}

export default router({
	describe: publicProcedure
		.use(authMiddleware(userApproved))
		.input(request)
		.query(async ({ input, ctx }) => {
			enabled()
			const { client, error } = await checked(input)
			return {
				client: {
					name: client.name,
					clientUri: client.clientUri,
					logoUri: client.logoUri,
					returnsTo: new URL(input.redirect_uri!).host,
					registeredAt: client.createdAt,
				},
				scopes: grantedScopes(input.scope, ctx.user.role),
				refusal: refusal(ctx.user),
				// A malformed request goes back to the assistant without asking.
				errorRedirect: error,
			}
		}),
	approve: publicProcedure
		.use(authMiddleware(userApproved))
		.input(request)
		.mutation(async ({ input, ctx }) => {
			enabled()
			const { client } = await checked(input)
			if (refusal(ctx.user)) throw new TRPCError({ code: 'FORBIDDEN', message: 'This account cannot connect an assistant.' })
			const redirectTo = await issueCode(ctx.user, input)
			await recordAudit(null, { actorId: ctx.user.id, action: 'assistant.authorized', targetType: 'user', targetId: ctx.user.id, after: { client: client.name, clientId: client.id }, req: ctx.req })
			return { redirectTo }
		}),
	deny: publicProcedure
		.use(authMiddleware(userApproved))
		.input(request)
		.mutation(async ({ input }) => {
			enabled()
			await checked(input)
			return { redirectTo: await denyRequest(input) }
		}),
})

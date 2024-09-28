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
import { Brackets } from "typeorm"
import { z } from "zod"
import { CollectionInvitation } from "../../../entity/collection-invitation"
import { User, UserRole } from "../../../entity/user"
import { dataSource } from "../../../env"
import { userCollectionsQuery } from "../../../services/collection"
import { createGuestUser } from "../../../services/user"
import { mailerInvitationQueue } from "../../../worker"
import { authMiddleware, publicProcedure, router, userApproved } from "../../index"

export function formatInvitation(invitation: CollectionInvitation) {
	return {
		id: invitation.id,
		collectionId: invitation.collectionId,
		email: invitation.email,
		expiresAt: invitation.expiresAt,
		createdAt: invitation.expiresAt,
	}
}

export default router({
	create: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				collectionId: z.string().uuid(),
				email: z.string().email(),
				expiresAt: z.coerce.date(),
				sendEmail: z.boolean().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user)
				.andWhere('collection.id = :id', { id: input.collectionId })
				.getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}

			const invitation = new CollectionInvitation()
			invitation.collection = collection
			invitation.email = input.email
			invitation.expiresAt = new Date(input.expiresAt)
			invitation.user = await dataSource.getRepository(User).findOneBy({ email: input.email })
			await dataSource.transaction(async (em) => {
				if (!invitation.user) {
					invitation.user = await createGuestUser({ em, email: input.email, regionId: ctx.user.regionId })
				}
				await em.save(invitation)
				if (input.sendEmail) {
					await mailerInvitationQueue.push({ invitationId: invitation.id })
				}
			})
		}),
	remove: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ input, ctx }) => {
			const invitation = await dataSource.getRepository(CollectionInvitation).findOne({
				where: { id: input.id },
				relations: { collection: true },
			})
			if (!invitation) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found.' })
			} else if (!invitation.collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}

			await dataSource.getRepository(CollectionInvitation).remove(invitation)
		}),
	getUserInvitations: publicProcedure
		.use(authMiddleware())
		.query(async ({ ctx }) => {
			const invitations = await dataSource
				.getRepository(CollectionInvitation)
				.createQueryBuilder('invitation')
				.innerJoinAndSelect('invitation.collection', 'collection')
				.where(new Brackets(qb => {
					qb.where('collection.ownerId = :userId', { userId: ctx.user.id })
					if (ctx.user.role === UserRole.ADMIN) {
						qb.orWhere('collection.public = TRUE')
					}
				}))
				.select([
					'invitation.id',
					'invitation.email',
					'invitation.expiresAt',
					'invitation.createdAt',
					'collection.id',
					'collection.name',
					'collection.public',
					'collection.ownerId'
				])
				.getMany()

			return invitations.map(invitation => ({
				id: invitation.id,
				email: invitation.email,
				expiresAt: invitation.expiresAt,
				createdAt: invitation.createdAt,
				collection: {
					id: invitation.collection.id,
					name: invitation.collection.name,
					public: invitation.collection.public,
					isOwnedByUser: invitation.collection.ownerId === ctx.user.id
				}
			}))
		}),
})

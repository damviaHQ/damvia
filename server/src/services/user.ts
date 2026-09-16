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
import {FastifyRequest} from 'fastify'
import {sign, verify} from "jsonwebtoken"
import {randomBytes} from 'node:crypto'
import {hashPassword} from './credentials'
import {EntityManager} from "typeorm"
import {AuthorizedDomain} from "../entity/authorized-domain"
import {Collection} from "../entity/collection"
import {Download} from "../entity/download"
import {Region} from "../entity/region"
import {User, UserRole} from "../entity/user"
import {dataSource, passwordLessAuth, secret} from "../env"
import {mailerEmailVerificationQueue} from "../worker"
import {removeDownloads} from "./download"
import {CollectionInvitation} from "../entity/collection-invitation"
import {UserGroup} from "../entity/user-group";

export type CreateUserOptions = {
	name: string
	company: string
	regionId: string
	email: string
	password: string | null
}

export async function createUser(opts: CreateUserOptions) {
	const user = new User()
	user.name = opts.name
	user.company = opts.company
	user.region = await dataSource.getRepository(Region).findOne({
		where: { id: opts.regionId },
	})
	if (user.region?.defaultGroupId) {
		const userGroup = new UserGroup()
		userGroup.groupId = user.region.defaultGroupId
		user.userGroups = [userGroup]
	}
	user.email = opts.email
	user.role = UserRole.MEMBER
	user.emailVerificationCode = randomBytes(12).toString('hex')
	if (!passwordLessAuth()) {
		user.password = await hashPassword(opts.password)
	}

	const emailDomain = user.email.split('@').pop()
	user.approved = await dataSource.getRepository(AuthorizedDomain).exist({ where: { domain: emailDomain } })

	await dataSource.transaction(async (em) => {
		await em.getRepository(User).save(user)
		await mailerEmailVerificationQueue.push({ userId: user.id })
	})
	return user
}

export type CreateGuestUserOptions = {
	em: EntityManager
	regionId: string
	email: string
}

export async function createGuestUser(opts: CreateGuestUserOptions) {
	const user = new User()
	user.name = 'NA'
	user.company = 'NA'
	user.region = await dataSource.getRepository(Region).findOne({
		where: { id: opts.regionId },
	})
	user.userGroups = []
	user.email = opts.email
	user.approved = true
	user.emailVerified = true
	user.role = UserRole.GUEST
	await opts.em.getRepository(User).save(user)
	return user
}

export function generateAuthToken(user: User) {
	return new Promise<string>((resolve, reject) => {
		sign({ userId: user.id, authVersion: user.authVersion }, secret(), { expiresIn: '180d' }, (err: Error | null, token: string) => {
			if (err) {
				return reject(err)
			}
			resolve(token)
		})
	})
}

export async function getUserFromRequest(req: FastifyRequest): Promise<User | null> {
	const authorization = req.headers.authorization
	if (!authorization) {
		return null
	}

	try {
		const payload = verify(authorization, secret(), { algorithms: ['HS256'] })
		if (typeof payload === 'string' || typeof payload.userId !== 'string' ||
			!Number.isInteger(payload.authVersion)) return null
		return await dataSource.getRepository(User).findOne({
			where: { id: payload.userId, authVersion: payload.authVersion },
			relations: { userGroups: { group: true } },
		})
	} catch {
		return null
	}
}

export async function removeUser(user: User) {
	await dataSource.transaction(async (em) => {
		await em.getRepository(CollectionInvitation).delete({ email: user.email })
		await em.getRepository(Collection).update({ ownerId: user.id, public: true }, { ownerId: null })

		const downloads = await em.getRepository(Download).findBy({ userId: user.id })
		await removeDownloads({ em, downloads })
		await em.getRepository(User).remove(user)
	})
}

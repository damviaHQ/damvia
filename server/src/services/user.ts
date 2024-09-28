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
import { FastifyRequest } from 'fastify'
import { sign, verify } from "jsonwebtoken"
import { createHash, randomBytes } from 'node:crypto'
import { EntityManager } from "typeorm"
import { AuthorizedDomain } from "../entity/authorized-domain"
import { Collection } from "../entity/collection"
import { Download } from "../entity/download"
import { Region } from "../entity/region"
import { User, UserRole } from "../entity/user"
import { dataSource, passwordLessAuth, secret } from "../env"
import { mailerEmailVerificationQueue } from "../worker"
import { removeDownloads } from "./download"
import { CollectionInvitation } from "../entity/collection-invitation"

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
	user.region = await dataSource.getRepository(Region).findOneBy({ id: opts.regionId })
	user.groupId = user.region?.defaultGroupId
	user.email = opts.email
	user.role = UserRole.MEMBER
	user.emailVerificationCode = randomBytes(12).toString('hex')
	if (!passwordLessAuth()) {
		user.password = hashPassword(opts.password)
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
	user.region = await dataSource.getRepository(Region).findOneBy({ id: opts.regionId })
	user.groupId = user.region?.defaultGroupId
	user.email = opts.email
	user.approved = true
	user.emailVerified = true
	user.role = UserRole.GUEST
	await opts.em.getRepository(User).save(user)
	return user
}

export function generateAuthToken(user: User) {
	return new Promise<string>((resolve, reject) => {
		sign({ userId: user.id }, secret(), { expiresIn: '180d' }, (err: Error | null, token: string) => {
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

	const userId = await new Promise<string | null>((resolve) => {
		verify(authorization, secret(), (err: Error | null, data: { userId: string }) => {
			if (err) {
				return resolve(null)
			}
			resolve(data.userId)
		})
	})
	if (!userId) {
		return null
	}

	return dataSource.getRepository(User).findOneBy({ id: userId })
}

export function hashPassword(raw: string) {
	const hash = createHash('sha512')
	hash.update(raw)
	return hash.digest().toString('hex')
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

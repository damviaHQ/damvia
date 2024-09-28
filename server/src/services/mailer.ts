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
import { In } from "typeorm"
import { URL } from "url"
import { Liquid } from 'liquidjs'
import { CollectionInvitation } from "../entity/collection-invitation"
import { Download } from "../entity/download"
import { User, UserRole } from "../entity/user"
import { appURL, assetsS3, assetsS3Bucket, dataSource, mailTransporter, mailConfig } from "../env"
import { generateAuthToken } from "./user"

const engine = new Liquid()

async function renderTemplate(template: string, context: object): Promise<string> {
	return engine.parseAndRender(template, context)
}

export async function sendEmailVerificationEmail(user: User) {
	const url = new URL(appURL())
	url.searchParams.set('verificationCode', user.emailVerificationCode)
	const config = mailConfig()['email-verification']
	await mailTransporter().sendMail({
		from: config.from,
		to: user.email,
		subject: config.subject,
		text: await renderTemplate(config.body, { url: url.toString() })
	})
}

export async function sendLogInEmail(user: User) {
	const url = new URL(appURL())
	url.pathname = 'login'
	url.searchParams.set('token', await generateAuthToken(user))
	const config = mailConfig()['login']
	await mailTransporter().sendMail({
		from: config.from,
		to: user.email,
		subject: config.subject,
		text: await renderTemplate(config.body, { url: url.toString() })
	})
}

export async function sendResetPasswordEmail(user: User) {
	const url = new URL(appURL())
	url.pathname = 'password-update'
	url.searchParams.set('email', user.email)
	url.searchParams.set('token', user.resetPasswordToken)
	const config = mailConfig()['reset-password']
	await mailTransporter().sendMail({
		from: config.from,
		to: user.email,
		subject: config.subject,
		text: await renderTemplate(config.body, { url: url.toString() })
	})
}

export async function sendRequestApprovalEmail(requester: User) {
	const url = new URL(appURL())
	url.pathname = `/admin/users/${requester.id}/edit`

	const managers = await dataSource.getRepository(User).findBy({
		role: In([UserRole.MANAGER, UserRole.ADMIN]),
		regionId: requester.regionId,
	})
	if (!managers.length) {
		return
	}

	const config = mailConfig()['request-approval']
	await mailTransporter().sendMail({
		from: config.from,
		to: managers.map((m) => m.email).join(', '),
		subject: await renderTemplate(config.subject, { requester: { name: requester.name } }),
		text: await renderTemplate(config.body, { requester: { name: requester.name }, url: url.toString() })
	})
}

export async function sendUserApprovedEmail(user: User) {
	const url = new URL(appURL())
	url.pathname = 'login'
	url.searchParams.set('token', await generateAuthToken(user))
	const config = mailConfig()['user-approved']
	await mailTransporter().sendMail({
		from: config.from,
		to: user.email,
		subject: config.subject,
		text: await renderTemplate(config.body, { user: { name: user.name }, url: url.toString() })
	})
}

export async function sendDownloadReady(download: Download) {
	const user = await dataSource.getRepository(User).findOneBy({ id: download.userId })
	if (!user) {
		return
	}

	const link = await assetsS3().presignedGetObject(assetsS3Bucket(), download.storageKey)
	const config = mailConfig()['download-ready']
	await mailTransporter().sendMail({
		from: config.from,
		to: user.email,
		subject: config.subject,
		text: await renderTemplate(config.body, { link })
	})
}

export async function sendInvitation(invitation: CollectionInvitation) {
	const url = new URL(appURL())
	url.pathname = `/collections/${invitation.collectionId}`
	url.searchParams.set('dam_token', await generateAuthToken(invitation.user))

	const config = mailConfig()['invitation']
	await mailTransporter().sendMail({
		from: config.from,
		to: invitation.email,
		subject: config.subject,
		text: await renderTemplate(config.body, { url: url.toString() })
	})
}

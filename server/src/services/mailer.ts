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
import { randomBytes } from 'node:crypto'
import { hashToken } from './credentials'
import { IsNull } from "typeorm"
import { URL } from "url"
import { CollectionInvitation } from "../entity/collection-invitation"
import { Download } from "../entity/download"
import { User, UserRole } from "../entity/user"
import { apiURL, appURL, dataSource, logger, mailTransporter, serverAlertEmails } from "../env"
import { emailSender, renderEmail } from "../mail/render"
import { formatBytes } from "./storage"
import { createLoginToken } from "./login-token"
import { LoginTokenPurpose } from "../entity/login-token"

export async function sendTemplate(key: string, to: string | string[], values: Record<string, unknown>) {
	const [email, sender] = await Promise.all([renderEmail(key, values), emailSender()])
	await mailTransporter().sendMail({
		from: sender.from,
		replyTo: sender.replyTo,
		to: Array.isArray(to) ? to.join(', ') : to,
		subject: email.subject,
		html: email.html,
		text: email.text,
	})
}

export function formatMailDate(date: Date | string): string {
	return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(date))
}

export async function sendEmailVerificationEmail(user: User) {
	const url = new URL(appURL())
	url.searchParams.set('verificationCode', user.emailVerificationCode ?? '')
	await sendTemplate('email-verification', user.email, { url: url.toString() })
}

export async function sendLogInEmail(user: User) {
	const url = new URL(appURL())
	url.pathname = 'login'
	url.searchParams.set('link', await createLoginToken(user.id, LoginTokenPurpose.LOGIN))
	await sendTemplate('login', user.email, { url: url.toString() })
}

// The token is created here, not by the request, so it never sits in the job
// queue. A newer request replaces the previous link.
export async function sendResetPasswordEmail(user: User | null) {
	if (!user || user.suspendedAt) return
	const token = randomBytes(32).toString('hex')
	await dataSource.getRepository(User).update(user.id, {
		resetPasswordToken: hashToken(token),
		resetPasswordExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
	})
	const url = new URL(appURL())
	url.pathname = 'password-update'
	url.searchParams.set('email', user.email)
	url.searchParams.set('token', token)
	await sendTemplate('reset-password', user.email, { url: url.toString() })
}

export async function sendRequestApprovalEmail(requester: User) {
	const url = new URL(appURL())
	url.pathname = `/admin/users/${requester.id}`

	// Admins approve every region; managers only their own.
	const managers = await dataSource.getRepository(User).find({
		where: [
			{ role: UserRole.ADMIN, approved: true, emailVerified: true, suspendedAt: IsNull() },
			{ role: UserRole.MANAGER, regionId: requester.regionId, approved: true, emailVerified: true, suspendedAt: IsNull() },
		],
	})
	if (!managers.length) {
		return
	}

	await sendTemplate('request-approval', managers.map((m) => m.email), {
		requester: { name: requester.name, email: requester.email, company: requester.company },
		url: url.toString(),
	})
}

export async function sendUserApprovedEmail(user: User) {
	const url = new URL(appURL())
	url.pathname = 'login'
	url.searchParams.set('link', await createLoginToken(user.id, LoginTokenPurpose.APPROVED))
	await sendTemplate('user-approved', user.email, { user: { name: user.name }, url: url.toString() })
}

export async function sendDownloadReady(download: Download) {
	const user = await dataSource.getRepository(User).findOneBy({ id: download.userId })
	if (!user) {
		return
	}

	// Through the API, which checks the download and its owner on every click.
	const url = `${apiURL()}/v1/downloads/${download.id}`
	await sendTemplate('download-ready', user.email, { url, expiresAt: formatMailDate(download.expiresAt) })
}

export async function sendInvitation(invitation: CollectionInvitation) {
	const url = new URL(appURL())
	url.pathname = 'login'
	if (!invitation.user) throw new Error('Invitation has no user')
	// Each email gets a fresh secret; links from earlier emails stop working.
	const secret = randomBytes(32).toString('base64url')
	await dataSource.getRepository(CollectionInvitation).update(invitation.id, { tokenHash: hashToken(secret) })
	url.searchParams.set('invite', `${invitation.id}.${secret}`)

	await sendTemplate('invitation', invitation.email, {
		url: url.toString(),
		collection: { name: invitation.collection?.name ?? '' },
		inviter: { name: invitation.invitedBy?.name ?? '' },
		expiresAt: formatMailDate(invitation.expiresAt),
	})
}

export async function sendStorageAlert(level: number, usage: { usedBytes: number, quotaBytes: number, percent: number }): Promise<boolean> {
	const admins = await dataSource.getRepository(User).findBy({ role: UserRole.ADMIN, approved: true, emailVerified: true, maintenanceContact: true })
	if (!admins.length) {
		logger.warn('storage.alert-no-recipient', { level })
		return false
	}

	const url = new URL(appURL())
	url.pathname = '/admin'
	await sendTemplate('storage-alert', admins.map((admin) => admin.email), {
		severity: level >= 100 ? 'full' : level >= 90 ? 'critical' : 'warning',
		percent: Math.round(usage.percent),
		used: formatBytes(usage.usedBytes),
		quota: formatBytes(usage.quotaBytes),
		url: url.toString(),
	})
	logger.info('storage.alert-sent', { level, recipients: admins.length })
	return true
}

export async function sendDiskAlert(level: number, disk: { totalBytes: number, freeBytes: number, percent: number }): Promise<boolean> {
	const recipients = serverAlertEmails()
	if (!recipients.length) {
		return false
	}

	await sendTemplate('disk-alert', recipients, {
		severity: level >= 100 ? 'full' : level >= 90 ? 'critical' : 'warning',
		percent: Math.round(disk.percent),
		free: formatBytes(disk.freeBytes),
		total: formatBytes(disk.totalBytes),
	})
	logger.info('storage.disk-alert-sent', { level, recipients: recipients.length })
	return true
}

export type ExpiringLicense = { name: string, date: string, days: number }

export async function sendLicenseExpiryNotice(licenses: ExpiringLicense[]): Promise<boolean> {
	const admins = await dataSource.getRepository(User).findBy({ role: UserRole.ADMIN, approved: true, emailVerified: true, suspendedAt: IsNull() })
	if (!admins.length) {
		logger.warn('license.expiry-no-recipient', { admins: 0 })
		return false
	}
	const url = new URL(appURL())
	url.pathname = '/admin/licenses'
	await sendTemplate('license-expiring', admins.map((admin) => admin.email), { licenses, url: url.toString() })
	return true
}

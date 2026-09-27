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

export type EmailContent = {
	subject: string
	preheader: string
	heading: string
	bodyHtml: string
	buttonLabel: string
}

export type EmailVariable = { name: string, description: string }

export type EmailDefinition = {
	key: string
	label: string
	group: 'account' | 'sharing' | 'alerts'
	trigger: string
	recipients: string
	// The context value the button points to; null for emails without a button.
	action: string | null
	variables: EmailVariable[]
	// Values the mailer renders as HTML itself, such as a list. They print as
	// they are, where the admin places them.
	blocks: EmailVariable[]
	sample: Record<string, unknown>
	defaults: EmailContent
}

// Available in every template.
export const GLOBAL_VARIABLES: EmailVariable[] = [
	{ name: 'appName', description: 'Your brand name, set in Settings' },
	{ name: 'appUrl', description: 'The address of the portal' },
]

const url = (description: string): EmailVariable => ({ name: 'url', description })

export const EMAIL_DEFINITIONS: EmailDefinition[] = [
	{
		key: 'email-verification',
		label: 'Email verification',
		group: 'account',
		trigger: 'Someone signs up, or an admin changes their email address.',
		recipients: 'The person signing up',
		action: 'url',
		variables: [url('The confirmation link')],
		blocks: [],
		sample: { url: 'https://dam.example.com/?verificationCode=sample' },
		defaults: {
			subject: 'Confirm your email address',
			preheader: 'One click and your account is ready.',
			heading: 'Confirm your email address',
			bodyHtml: '<p>Thanks for signing up to {{ appName }}. Confirm that this address is yours to finish creating your account.</p><p>If you did not sign up, you can ignore this email.</p>',
			buttonLabel: 'Confirm my email',
		},
	},
	{
		key: 'login',
		label: 'Sign-in link',
		group: 'account',
		trigger: 'Someone asks for a sign-in link on the login page.',
		recipients: 'The person signing in',
		action: 'url',
		variables: [url('The one-time sign-in link')],
		blocks: [],
		sample: { url: 'https://dam.example.com/login?link=sample' },
		defaults: {
			subject: 'Your sign-in link',
			preheader: 'Use this link to sign in. It works once.',
			heading: 'Sign in to {{ appName }}',
			bodyHtml: '<p>Use the button below to sign in. The link works once and expires shortly.</p><p>If you did not ask to sign in, you can ignore this email: nobody can use your account without this link.</p>',
			buttonLabel: 'Sign in',
		},
	},
	{
		key: 'reset-password',
		label: 'Password reset',
		group: 'account',
		trigger: 'Someone asks to reset their password, or an admin sends a reset link.',
		recipients: 'The account owner',
		action: 'url',
		variables: [url('The password reset link, valid for one hour')],
		blocks: [],
		sample: { url: 'https://dam.example.com/password-update?token=sample' },
		defaults: {
			subject: 'Reset your password',
			preheader: 'This link is valid for one hour.',
			heading: 'Reset your password',
			bodyHtml: '<p>We received a request to reset the password of your {{ appName }} account. Choose a new one with the button below. The link is valid for one hour.</p><p>If you did not ask for this, ignore this email: your password stays the same.</p>',
			buttonLabel: 'Choose a new password',
		},
	},
	{
		key: 'request-approval',
		label: 'Approval request',
		group: 'account',
		trigger: 'A new account confirms its email and needs approval.',
		recipients: 'Admins, and managers of the requester’s region',
		action: 'url',
		variables: [
			{ name: 'requester.name', description: 'Name of the person asking for access' },
			{ name: 'requester.email', description: 'Their email address' },
			{ name: 'requester.company', description: 'Their company' },
			url('Link to their profile in the admin'),
		],
		blocks: [],
		sample: { requester: { name: 'Alex Martin', email: 'alex@example.com', company: 'Example Ltd' }, url: 'https://dam.example.com/admin/users/sample' },
		defaults: {
			subject: '{{ requester.name }} is waiting for approval',
			preheader: 'A new account needs your review.',
			heading: 'New access request',
			bodyHtml: '<p><strong>{{ requester.name }}</strong> ({{ requester.email }}) has created an account and is waiting for your approval.</p><p>Review their profile to approve them and choose their groups.</p>',
			buttonLabel: 'Review the request',
		},
	},
	{
		key: 'user-approved',
		label: 'Account approved',
		group: 'account',
		trigger: 'An admin or manager approves an account.',
		recipients: 'The approved person',
		action: 'url',
		variables: [
			{ name: 'user.name', description: 'Name of the approved person' },
			url('A sign-in link, valid for seven days'),
		],
		blocks: [],
		sample: { user: { name: 'Alex Martin' }, url: 'https://dam.example.com/login?link=sample' },
		defaults: {
			subject: 'Your {{ appName }} account is ready',
			preheader: 'You now have access. Sign in to get started.',
			heading: 'Welcome, {{ user.name }}',
			bodyHtml: '<p>Your account has been approved. You can now browse, collect and download the assets shared with you.</p>',
			buttonLabel: 'Open {{ appName }}',
		},
	},
	{
		key: 'invitation',
		label: 'Collection invitation',
		group: 'sharing',
		trigger: 'Someone shares a collection and chooses to send an email.',
		recipients: 'The invited person',
		action: 'url',
		variables: [
			{ name: 'collection.name', description: 'Name of the shared collection' },
			{ name: 'inviter.name', description: 'Name of the person who shared it' },
			{ name: 'expiresAt', description: 'The date the invitation ends' },
			url('The invitation link'),
		],
		blocks: [],
		sample: { collection: { name: 'Spring campaign' }, inviter: { name: 'Sam Lee' }, expiresAt: '2026-12-31', url: 'https://dam.example.com/login?invite=sample' },
		defaults: {
			subject: '{{ inviter.name | default: "Someone" }} shared “{{ collection.name }}” with you',
			preheader: 'Open the collection to see its files.',
			heading: 'You have been invited to a collection',
			bodyHtml: '<p>{{ inviter.name | default: "Someone" }} shared the collection <strong>{{ collection.name }}</strong> with you on {{ appName }}.</p><p>The invitation is valid until {{ expiresAt }}.</p>',
			buttonLabel: 'Open the collection',
		},
	},
	{
		key: 'download-ready',
		label: 'Download ready',
		group: 'sharing',
		trigger: 'A large download has finished preparing.',
		recipients: 'The person who asked for it',
		action: 'url',
		variables: [
			{ name: 'expiresAt', description: 'The date the download link ends' },
			url('The download link'),
		],
		blocks: [],
		sample: { expiresAt: '2026-10-04', url: 'https://api.dam.example.com/v1/downloads/sample' },
		defaults: {
			subject: 'Your download is ready',
			preheader: 'Your files are packed and ready to download.',
			heading: 'Your download is ready',
			bodyHtml: '<p>The files you asked for are packed into one archive. The link works until {{ expiresAt }}.</p>',
			buttonLabel: 'Download the files',
		},
	},
	{
		key: 'storage-alert',
		label: 'Storage alert',
		group: 'alerts',
		trigger: 'Storage use crosses 80%, 90% or 100% of the plan.',
		recipients: 'Admins marked as maintenance contacts',
		action: 'url',
		variables: [
			{ name: 'severity', description: 'warning, critical or full' },
			{ name: 'percent', description: 'Share of the plan used' },
			{ name: 'used', description: 'Storage used, such as 81 GB' },
			{ name: 'quota', description: 'The plan size' },
			url('Link to the admin dashboard'),
		],
		blocks: [],
		sample: { severity: 'warning', percent: 82, used: '82 GB', quota: '100 GB', url: 'https://dam.example.com/admin' },
		defaults: {
			subject: 'Storage {{ severity }}: {{ percent }}% of the plan is used',
			preheader: '{{ used }} used out of {{ quota }}.',
			heading: 'Storage is {{ percent }}% full',
			bodyHtml: '<p>{{ appName }} uses <strong>{{ used }}</strong> of its <strong>{{ quota }}</strong> plan.</p><p>At 100%, new files from the cloud storage stop syncing until space is freed or the plan is raised. Remove unused folders from the cloud storage, or contact your provider to extend the plan.</p>',
			buttonLabel: 'Open the dashboard',
		},
	},
	{
		key: 'disk-alert',
		label: 'Server disk alert',
		group: 'alerts',
		trigger: 'The server disk crosses 80%, 90% or 100%.',
		recipients: 'The addresses in SERVER_ALERT_EMAILS',
		action: null,
		variables: [
			{ name: 'severity', description: 'warning, critical or full' },
			{ name: 'percent', description: 'Share of the disk used' },
			{ name: 'free', description: 'Free space' },
			{ name: 'total', description: 'Disk size' },
		],
		blocks: [],
		sample: { severity: 'critical', percent: 91, free: '9 GB', total: '100 GB' },
		defaults: {
			subject: 'Server disk {{ severity }}: {{ percent }}% used on {{ appUrl }}',
			preheader: '{{ free }} free out of {{ total }}.',
			heading: 'Server disk is {{ percent }}% full',
			bodyHtml: '<p>The disk hosting {{ appUrl }} has <strong>{{ free }}</strong> free out of {{ total }}.</p><p>Check orphan objects, expired archives, temporary files and the database size before the disk is full, or extend the volume.</p>',
			buttonLabel: '',
		},
	},
	{
		key: 'license-expiring',
		label: 'Licences ending',
		group: 'alerts',
		trigger: 'A usage licence reaches one of the notice days before its end.',
		recipients: 'Admins',
		action: 'url',
		variables: [
			{ name: 'licenses.size', description: 'How many licences end soon' },
			url('Link to the licences page'),
		],
		blocks: [{ name: 'licenseList', description: 'The list of licences with their end dates' }],
		sample: {
			licenses: [{ name: 'Spring shoot', date: '2026-10-27', days: 30 }, { name: 'Stock photos', date: '2026-10-04', days: 7 }],
			url: 'https://dam.example.com/admin/licenses',
		},
		defaults: {
			subject: '{% if licenses.size == 1 %}A licence ends in {{ licenses[0].days }} day{% if licenses[0].days != 1 %}s{% endif %}{% else %}{{ licenses.size }} licences end soon{% endif %}',
			preheader: 'Renew them before files become unavailable.',
			heading: 'Usage licences end soon',
			bodyHtml: '<p>After their end date, files under these licences can no longer be downloaded by non-admin users.</p><p>{{ licenseList }}</p><p>Renew them, or move the files to another licence.</p>',
			buttonLabel: 'Review licences',
		},
	},
]

export function emailDefinition(key: string): EmailDefinition {
	const definition = EMAIL_DEFINITIONS.find((candidate) => candidate.key === key)
	if (!definition) throw new Error(`Unknown email template "${key}"`)
	return definition
}

export const EMAIL_KEYS = EMAIL_DEFINITIONS.map((definition) => definition.key) as [string, ...string[]]

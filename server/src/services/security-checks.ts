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
import { assetsS3, assetsS3Bucket, logger, mainS3, mainS3Bucket } from '../env'

const localHosts = /^(localhost|127\.|\[?::1\]?$)/

// Configuration that works but leaves traffic unprotected. Logged at startup
// so it shows in the first lines an operator reads; nothing is refused.
export function transportWarnings(environment: NodeJS.ProcessEnv): string[] {
	const warnings: string[] = []
	if (environment.NODE_ENV === 'production') {
		for (const name of ['APP_URL', 'API_URL']) {
			const value = environment[name]
			if (value && value.startsWith('http:') && !localHosts.test(new URL(value).hostname)) {
				warnings.push(`${name} is not HTTPS: session cookies are not marked Secure and travel in clear text.`)
			}
		}
		for (const name of ['MAIN_S3_URL', 'ASSETS_S3_URL']) {
			const value = environment[name]
			if (value && value.startsWith('http:') && !localHosts.test(new URL(value).hostname)) {
				warnings.push(`${name} is not HTTPS: fine on a private network, otherwise files and keys travel in clear text.`)
			}
		}
	}
	const smtpHost = environment.SMTP_HOST ?? 'localhost'
	if (!localHosts.test(smtpHost) && environment.SMTP_PORT !== '465' && environment.SMTP_REQUIRE_TLS !== 'true') {
		warnings.push('SMTP_REQUIRE_TLS is not true: emails with sign-in links may be sent without encryption.')
	}
	return warnings
}

// Encryption at rest belongs to the bucket: a default server-side encryption
// rule covers every object whichever code path writes it.
export async function bucketEncryptionWarnings(): Promise<string[]> {
	const warnings: string[] = []
	for (const [name, client, bucket] of [['MAIN_S3_URL', mainS3, mainS3Bucket], ['ASSETS_S3_URL', assetsS3, assetsS3Bucket]] as const) {
		try {
			const configuration = await client().getBucketEncryption(bucket())
			if (!configuration?.Rule?.length) throw new Error('no rule')
		} catch {
			warnings.push(`The bucket of ${name} has no default server-side encryption, or it could not be read: files are stored unencrypted unless the disk is.`)
		}
	}
	return warnings
}

export async function logSecurityWarnings() {
	const warnings = [...transportWarnings(process.env)]
	if (process.env.S3_ENCRYPTION_CHECK !== 'false') warnings.push(...await bucketEncryptionWarnings())
	for (const warning of warnings) logger.warn('security.configuration', { warning })
}

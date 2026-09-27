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
import { dataSource, licenseNoticeDays } from '../env'
import { ExpiringLicense, sendLicenseExpiryNotice } from './mailer'

// Licences whose end date is exactly one of the notice days away, so each
// licence is announced once per notice day without storing what was sent.
export async function expiringLicenses(today: Date, noticeDays: number[]): Promise<ExpiringLicense[]> {
	if (!noticeDays.length) return []
	const rows: { name: string, date: string, days: number }[] = await dataSource.query(`
		SELECT name, to_char(usage_to, 'YYYY-MM-DD') AS date, (usage_to - $1::date)::int AS days
		FROM licenses WHERE usage_to IS NOT NULL AND (usage_to - $1::date) = ANY($2::int[])
		ORDER BY usage_to, name
	`, [today.toISOString().slice(0, 10), noticeDays])
	return rows
}

export async function notifyExpiringLicenses(today = new Date()): Promise<number> {
	const licenses = await expiringLicenses(today, licenseNoticeDays())
	if (licenses.length) await sendLicenseExpiryNotice(licenses)
	return licenses.length
}

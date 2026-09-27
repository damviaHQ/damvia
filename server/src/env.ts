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
import './load-env'
import "reflect-metadata"
import { Client as MinioClient } from 'minio'
import { readFile, statfs } from "node:fs/promises"
import { join } from "node:path"
import { createTransport, Transporter } from 'nodemailer'
import { DataSource } from "typeorm"
import { SnakeNamingStrategy } from "./lib/snake-naming-strategy"
import { URL } from "url"
import { createLogger, format, transports } from "winston"
import AssetUpdater from "./asset-updater/base"
import DropboxAssetUpdater from "./asset-updater/dropbox"
import OneDriveAssetUpdater from "./asset-updater/one-drive"
import GoogleDriveAssetUpdater, { parseServiceAccount } from "./asset-updater/google-drive"
import { AssetSourceConfig, legacyAssetSource, parseAssetSources } from "./asset-updater/sources"

import { validateAppSecret } from './services/credentials'

const appSecret = validateAppSecret(process.env.APP_SECRET)

const storageUnits = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15 }

export function parseStorageQuota(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) {
    return null
  }
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([KMGTP]?B)?$/i)
  if (!match) {
    throw new Error('STORAGE_QUOTA must be a size such as 1500GB or 1.5TB.')
  }
  const unit = (match[2] ?? 'B').toUpperCase() as keyof typeof storageUnits
  const bytes = Math.round(parseFloat(match[1]) * storageUnits[unit])
  if (bytes <= 0) {
    throw new Error('STORAGE_QUOTA must be a size such as 1500GB or 1.5TB.')
  }
  return bytes
}

const configuredStorageQuota = parseStorageQuota(process.env.STORAGE_QUOTA)

export function storageQuota(): number | null {
  return configuredStorageQuota
}

function parseDeletionPercent(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return 20
  }
  const percent = Number(raw)
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error('ASSET_SYNC_MAX_DELETION_PERCENT must be a whole number between 0 and 100.')
  }
  return percent
}

const configuredDeletionPercent = parseDeletionPercent(process.env.ASSET_SYNC_MAX_DELETION_PERCENT)

export function assetSyncMaxDeletionPercent(): number {
  return configuredDeletionPercent
}

export function serverAlertEmails(): string[] {
  return (process.env.SERVER_ALERT_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
}

export async function diskUsage(): Promise<{ totalBytes: number, freeBytes: number }> {
  const disk = await statfs(process.env.STORAGE_DISK_PATH || '/')
  return { totalBytes: disk.blocks * disk.bsize, freeBytes: disk.bavail * disk.bsize }
}

export function serializeErrors(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeErrors(item, depth + 1))
  }
  if (value instanceof Error) {
    const error = value as Error & { code?: unknown, detail?: unknown, query?: unknown, cause?: unknown }
    return {
      name: error.name,
      message: error.message,
      ...(error.code !== undefined && { code: error.code }),
      ...(error.detail !== undefined && { detail: error.detail }),
      ...(error.query !== undefined && { query: error.query }),
      ...(error.cause !== undefined && { cause: serializeErrors(error.cause, depth + 1) }),
    }
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return value
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeErrors(item, depth + 1)]))
}

const errorDetails = format((info) => {
  for (const key of Object.keys(info)) {
    info[key] = serializeErrors(info[key])
  }
  return info
})

export const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.splat(),
    errorDetails(),
    format.simple(),
  ),
  transports: [new transports.Console()]
})

export const dataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL ?? 'postgresql://dam:dam@localhost/dam',
  synchronize: false,
  logging: false,
  migrationsRun: true,
  namingStrategy: new SnakeNamingStrategy(),
  entities: [join(__dirname, 'entity', '*.{js,ts}')],
  migrations: [join(__dirname, 'migrations', '*.{js,ts}')],
  subscribers: [],
})

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set`)
  return value
}

let _mailTransporter: Transporter | null = null
export function mailTransporter(): Transporter {
  if (!_mailTransporter) {
    _mailTransporter = createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
      secure: process.env.SMTP_PORT === '465',
      requireTLS: process.env.SMTP_REQUIRE_TLS === 'true',
      auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    }, {
      headers: {
        'X-PM-Message-Stream': 'outbound',
      },
    })
  }
  return _mailTransporter
}

// Days before a licence's end date on which admins are emailed.
export function parseLicenseNoticeDays(raw: string | undefined): number[] {
  if (raw !== undefined && raw.trim() === '') return []
  const days = (raw ?? '30,7,1').split(',').map((value) => Number(value.trim()))
  if (days.some((value) => !Number.isInteger(value) || value < 0)) throw new Error('LICENSE_EXPIRY_NOTICE_DAYS must be whole numbers of days, such as 30,7,1.')
  return [...new Set(days)]
}

const configuredLicenseNoticeDays = parseLicenseNoticeDays(process.env.LICENSE_EXPIRY_NOTICE_DAYS)

export function licenseNoticeDays(): number[] {
  return configuredLicenseNoticeDays
}

// Audit entries are kept two years by default; 0 keeps them forever.
export function auditRetentionDays(): number | null {
  const days = parseInt(process.env.AUDIT_RETENTION_DAYS ?? '730', 10)
  return days > 0 ? days : null
}

// named: searches are stored with the searcher; anonymous: without them, so
// Insights keeps the terms but not who typed them; off: not stored.
export function analyticsSearchMode(): 'named' | 'anonymous' | 'off' {
  const value = (process.env.ANALYTICS_SEARCH_MODE ?? 'named').toLowerCase()
  if (value !== 'named' && value !== 'anonymous' && value !== 'off') throw new Error('ANALYTICS_SEARCH_MODE must be named, anonymous or off.')
  return value
}

export function auditLogIp(): boolean {
  return process.env.AUDIT_LOG_IP !== 'false'
}

export function auditLogStream(): boolean {
  return process.env.AUDIT_LOG_STREAM === 'true'
}

export function analyticsRetentionDays(): number | null {
  const days = parseInt(process.env.ANALYTICS_RETENTION_DAYS ?? '365', 10)
  return days > 0 ? days : null
}

export function passwordLessAuth() {
  return process.env.ENABLE_PASSWORD_LESS_AUTH === 'true'
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive whole number.`)
  return value
}

const configuredSessionIdleHours = positiveInteger('SESSION_IDLE_HOURS', 12)
const configuredSessionMaxHours = positiveInteger('SESSION_MAX_HOURS', 720)

export function sessionIdleHours(): number {
  return configuredSessionIdleHours
}

export function sessionMaxHours(): number {
  return configuredSessionMaxHours
}

const roles = ['admin', 'manager', 'member', 'guest']

export function parseMfaRequiredRoles(raw: string | undefined): string[] {
  const values = (raw ?? '').split(',').map((role) => role.trim().toLowerCase()).filter(Boolean)
  const unknown = values.filter((role) => !roles.includes(role))
  if (unknown.length) throw new Error(`MFA_REQUIRED_ROLES contains unknown roles: ${unknown.join(', ')}`)
  return values
}

const configuredMfaRequiredRoles = parseMfaRequiredRoles(process.env.MFA_REQUIRED_ROLES)

export function mfaRequiredRoles(): string[] {
  return configuredMfaRequiredRoles
}

export function passwordBreachCheck(): boolean {
  return process.env.PASSWORD_BREACH_CHECK !== 'false'
}

export function sessionCookieSameSite(): 'lax' | 'none' {
  const value = (process.env.SESSION_COOKIE_SAMESITE ?? 'lax').toLowerCase()
  if (value !== 'lax' && value !== 'none') throw new Error('SESSION_COOKIE_SAMESITE must be lax or none.')
  return value
}

export function secureCookies(): boolean {
  return apiURL().startsWith('https:')
}

// How many reverse proxies sit in front of the API, so the client address used
// for rate limiting and logs comes from X-Forwarded-For. `true` trusts any
// chain and suits only a private network.
export function parseTrustProxy(raw: string | undefined): boolean | number | string[] {
  const value = (raw ?? '1').trim()
  if (value === 'true') return true
  if (value === 'false' || value === '0') return false
  if (/^\d+$/.test(value)) return Number(value)
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

export function trustProxy(): boolean | string[] | ((address: string, hop: number) => boolean) {
  const value = parseTrustProxy(process.env.TRUST_PROXY)
  return typeof value === 'number' ? (_address, hop) => hop < value : value
}

export function requestLogging(): boolean {
  return process.env.REQUEST_LOG !== 'false'
}

export type OidcSettings = {
  issuer: string
  clientId: string
  clientSecret: string
  label: string
  scopes: string
  trustEmail: boolean
  autoCreate: boolean
  defaultRegion: string | null
  groupsClaim: string | null
  groupMap: Record<string, string>
  only: boolean
}

// Single sign-on is on when the issuer, client id and client secret are set.
export function parseOidcSettings(environment: NodeJS.ProcessEnv): OidcSettings | null {
  const issuer = environment.OIDC_ISSUER?.trim()
  const clientId = environment.OIDC_CLIENT_ID?.trim()
  const clientSecret = environment.OIDC_CLIENT_SECRET
  if (!issuer && !clientId) return null
  if (!issuer || !clientId || !clientSecret) throw new Error('OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET must be set together.')
  let groupMap: Record<string, string> = {}
  if (environment.OIDC_GROUP_MAP?.trim()) {
    const parsed = JSON.parse(environment.OIDC_GROUP_MAP)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.values(parsed).every((value) => typeof value === 'string')) {
      throw new Error('OIDC_GROUP_MAP must be a JSON object mapping identity provider groups to Damvia group names.')
    }
    groupMap = parsed
  }
  return {
    issuer,
    clientId,
    clientSecret,
    label: environment.OIDC_LABEL?.trim() || 'Single sign-on',
    scopes: environment.OIDC_SCOPES?.trim() || 'openid email profile',
    trustEmail: environment.OIDC_TRUST_EMAIL === 'true',
    autoCreate: environment.OIDC_AUTO_CREATE === 'true',
    defaultRegion: environment.OIDC_DEFAULT_REGION?.trim() || null,
    groupsClaim: environment.OIDC_GROUPS_CLAIM?.trim() || null,
    groupMap,
    only: environment.OIDC_ONLY === 'true',
  }
}

const configuredOidc = parseOidcSettings(process.env)

export function oidcSettings(): OidcSettings | null {
  return configuredOidc
}

export function secret() {
  return appSecret
}

export function apiURL() {
  return process.env.API_URL ?? 'http://localhost:3000'
}

export function appURL() {
  return process.env.APP_URL ?? 'http://localhost:5173'
}

let _mainS3: MinioClient | null = null
export function mainS3(): MinioClient {
  if (!_mainS3) {
    const s3URL = new URL(requireEnv('MAIN_S3_URL'))
    _mainS3 = new MinioClient({
      endPoint: s3URL.hostname,
      port: parseInt(s3URL.port || (s3URL.protocol === 'https:' ? '443' : '80'), 10),
      useSSL: s3URL.protocol === 'https:',
      accessKey: decodeURIComponent(s3URL.username),
      secretKey: decodeURIComponent(s3URL.password),
    })
  }
  return _mainS3
}

let _mainS3Bucket: string | null = null
export function mainS3Bucket(): string {
  if (!_mainS3Bucket) {
    _mainS3Bucket = new URL(requireEnv('MAIN_S3_URL')).pathname.slice(1)
  }
  return _mainS3Bucket
}

let _assetsS3: MinioClient | null = null
export function assetsS3(): MinioClient {
  if (!_assetsS3) {
    const s3URL = new URL(requireEnv('ASSETS_S3_URL'))
    _assetsS3 = new MinioClient({
      endPoint: s3URL.hostname,
      port: parseInt(s3URL.port || (s3URL.protocol === 'https:' ? '443' : '80'), 10),
      useSSL: s3URL.protocol === 'https:',
      accessKey: decodeURIComponent(s3URL.username),
      secretKey: decodeURIComponent(s3URL.password),
    })
  }
  return _assetsS3
}

let _assetsS3Bucket: string | null = null
export function assetsS3Bucket(): string {
  if (!_assetsS3Bucket) {
    _assetsS3Bucket = new URL(requireEnv('ASSETS_S3_URL')).pathname.slice(1)
  }
  return _assetsS3Bucket
}

function buildAssetUpdater(source: AssetSourceConfig): AssetUpdater {
  const identity = { key: source.key, label: source.label, root: source.root }
  switch (source.account.provider) {
    case 'dropbox':
      return new DropboxAssetUpdater(identity, source.account.appKey, source.account.appSecret, source.account.refreshToken, source.account.useTeamRoot === true, source.root)
    case 'onedrive':
      return new OneDriveAssetUpdater(identity, source.account.tenantId, source.account.clientId, source.account.clientSecret, source.account.user, source.root)
    case 'googledrive':
      return new GoogleDriveAssetUpdater(identity, parseServiceAccount(source.account.serviceAccount), source.root, source.account.impersonate)
  }
}

let _assetUpdaters: AssetUpdater[] | null = null
export function assetUpdaters(): AssetUpdater[] {
  if (!_assetUpdaters) {
    const sources = process.env.ASSET_SOURCES
      ? parseAssetSources(process.env.ASSET_SOURCES)
      : [legacyAssetSource(process.env, requireEnv)]
    _assetUpdaters = sources.map(buildAssetUpdater)
  }
  return _assetUpdaters
}

export function assetUpdaterFor(sourceKey: string): AssetUpdater {
  const updater = assetUpdaters().find((candidate) => candidate.key === sourceKey)
  if (!updater) throw new Error(`No asset source is configured with the key "${sourceKey}"`)
  return updater
}

type MailTemplateConfig = { from: string, subject: string, body: string }
let _mailConfig: Record<string, MailTemplateConfig> | null = null
if (process.env.MAILCONFIG) {
  _mailConfig = JSON.parse(Buffer.from(process.env.MAILCONFIG, 'base64').toString('utf-8'))
} else {
  readFile(join(__dirname, '..', 'mailconfig.json'), 'utf-8')
    .then((data) => _mailConfig = JSON.parse(data))
    .catch((error) => {
      logger.error('Failed to read mailconfig.json', { error })
      process.exit(1)
    })
}
export function mailConfig(): Record<string, MailTemplateConfig> {
  if (!_mailConfig) throw new Error('Mail configuration is not loaded')
  return _mailConfig
}

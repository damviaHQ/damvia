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
import { Client as MinioClient } from 'minio'
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { createTransport, Transporter } from 'nodemailer'
import { DataSource } from "typeorm"
import { SnakeNamingStrategy } from "typeorm-naming-strategies"
import { URL } from "url"
import { createLogger, format, transports } from "winston"
import AssetUpdater from "./asset-updater/base"
import DropboxAssetUpdater from "./asset-updater/dropbox"
import OneDriveAssetUpdater from "./asset-updater/one-drive"

export const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.splat(),
    format.simple(),
  ),
  transports: [new transports.Console()]
})

export const dataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL ?? 'postgresql://damvia:damvia@localhost/damvia',
  synchronize: false,
  logging: false,
  migrationsRun: true,
  namingStrategy: new SnakeNamingStrategy(),
  entities: [join(__dirname, 'entity', '*.{js,ts}')],
  migrations: [join(__dirname, 'migrations', '*.{js,ts}')],
  subscribers: [],
})

export function isProduction() {
  return process.env.NODE_ENV === 'production'
}

let _mailTransporter = null
export function mailTransporter(): Transporter {
  if (!_mailTransporter) {
    _mailTransporter = createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
      auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
      headers: {
        'X-PM-Message-Stream': 'outbound',
      },
    })
  }
  return _mailTransporter
}

export function passwordLessAuth() {
  return process.env.ENABLE_PASSWORD_LESS_AUTH === 'true'
}

export function secret() {
  return process.env.APP_SECRET ?? 'Damvia App Secret'
}

export function appURL() {
  return process.env.APP_URL ?? 'http://localhost:5173'
}

let _mainS3 = null
export function mainS3(): MinioClient {
  if (!_mainS3) {
    const s3URL = new URL(process.env.MAIN_S3_URL)
    _mainS3 = new MinioClient({
      endPoint: s3URL.hostname,
      port: parseInt(s3URL.port || (s3URL.protocol === 'https:' ? '443' : '80'), 10),
      useSSL: s3URL.protocol === 'https:',
      accessKey: s3URL.username,
      secretKey: s3URL.password,
    })
  }
  return _mainS3
}

let _mainS3Bucket = null
export function mainS3Bucket(): string {
  if (!_mainS3Bucket) {
    _mainS3Bucket = new URL(process.env.MAIN_S3_URL).pathname.slice(1)
  }
  return _mainS3Bucket
}

let _assetsS3 = null
export function assetsS3(): MinioClient {
  if (!_assetsS3) {
    const s3URL = new URL(process.env.ASSETS_S3_URL)
    _assetsS3 = new MinioClient({
      endPoint: s3URL.hostname,
      port: parseInt(s3URL.port || (s3URL.protocol === 'https:' ? '443' : '80'), 10),
      useSSL: s3URL.protocol === 'https:',
      accessKey: s3URL.username,
      secretKey: s3URL.password,
    })
  }
  return _assetsS3
}

let _assetsS3Bucket = null
export function assetsS3Bucket(): string {
  if (!_assetsS3Bucket) {
    _assetsS3Bucket = new URL(process.env.ASSETS_S3_URL).pathname.slice(1)
  }
  return _assetsS3Bucket
}

let _assetUpdater = null
export function assetUpdater(): AssetUpdater {
  if (!_assetUpdater) {
    if (process.env.ASSET_UPDATER === 'dropbox') {
      _assetUpdater = new DropboxAssetUpdater(
        process.env.DROPBOX_APP_KEY,
        process.env.DROPBOX_APP_SECRET,
        process.env.DROPBOX_REFRESH_TOKEN,
      )
    } else if (process.env.ASSET_UPDATER === 'onedrive') {
      _assetUpdater = new OneDriveAssetUpdater(
        process.env.ONEDRIVE_TENANT_ID,
        process.env.ONEDRIVE_CLIENT_ID,
        process.env.ONEDRIVE_CLIENT_SECRET,
        process.env.ONEDRIVE_USER,
        process.env.ONEDRIVE_DRIVE,
      )
    } else {
      throw new Error('Provide a valid asset updater')
    }
  }
  return _assetUpdater
}

let _mailConfig = null
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
export function mailConfig() {
  return _mailConfig
}

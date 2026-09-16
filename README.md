<img src="https://github.com/user-attachments/assets/edddec3c-dd0d-4e49-8a61-973f6bddc959" alt="Damvia Logo" width="300"/><br><br>
Damvia is an open-source Digital Asset Management (DAM) solution that works natively with your existing Cloud Storage.

## Features

- **Cloud-Native Integration**: Seamlessly works with Dropbox, OneDrive Business, and more integration possible.
- **PIM to DAM Automatic Linking**: Connects product information to assets automatically
- **Interactive Folder Pages**: Transform folders into rich, visual asset collections
- **Advanced Search**: Find assets quickly using product metadata

## Documentation

The full documentation (installation, configuration, integrations, deployment, administration, reference) lives in [`docs/`](docs/README.md) and is published on the Damvia website.

## Installation Requirements

- Dedicated Server
- SMTP provider (e.g., Postmark)
- Backup solution for PostgreSQL, the main S3 bucket, and configuration/secrets
- Asset originals and previews can be rebuilt only while cloud sources remain available; download archives cannot. See [Backups](docs/deployment/backups.md).

## Quick setup

Follow [Local setup](docs/getting-started/local-setup.md) for the complete sequence: install both packages, start PostgreSQL/MinIO/MailHog, create the two buckets, configure the provider and a non-empty `APP_SECRET`, then start server and client. The server must run with `ENABLE_WORKER=true`.

Create the first administrator using [First admin](docs/getting-started/first-admin.md), then execute the operator [acceptance checklist](docs/deployment/acceptance-checklist.md). Review [known limitations](docs/reference/known-limitations.md) and [validation status](docs/reference/validation-status.md) before deployment. End-user workflows will be documented separately.

## License

Damvia is released under the [GNU Affero General Public License v3.0](https://github.com/damviaHQ/damvia/blob/v1.0.0/LICENSE).

---

Developed with ❤️ by [Hive Horizon](https://www.hivehorizon.com)

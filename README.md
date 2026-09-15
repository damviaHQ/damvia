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
- Database backup solution
- Note: You don't need to backup data outside the DB as cloud storage retains all assets

## Quick Setup Guide

1. Clone the repository:

   ```
   git clone https://github.com/damviaHQ/damvia.git
   cd damvia
   ```

2. Install dependencies:

   ```
   cd server && npm install
   cd ../client && npm install
   ```

3. Configure environment variables:
   - Copy `.env.template` to `.env` in both `/server` and `/client` directories
   - Update the `.env` files with your settings, including:
     - PRODUCT_MATCHING_REGEX
     - SMTP configuration
     - Minio configuration

4. Set up Minio:
   - Login to Minio Dashboard and create 2 buckets that match the names in your config:
     ```
     MAIN_S3_URL=http://dam:damdamdamdam@localhost:9000/dam
     ASSETS_S3_URL=http://dam:damdamdamdam@localhost:9000/dam-assets
     ```
     dam for user uploaded visuals
     dam-assets for cloud storage assets

5. Configure Mail:
   - Update `mailconfig.json` with your content
   - Convert to base64:
     ```
     cat mailconfig.json | base64
     ```
   - Copy the encoded string to the MAILCONFIG environment variable

6. Start the services:
   ```
   cd server
   docker-compose up -d
   npm run dev
   ```

7. Start the client in a second terminal:
   ```
   cd client
   npm run dev
   ```
   Then open http://localhost:5173. See [docs/getting-started/first-admin.md](docs/getting-started/first-admin.md) to create the first administrator.

## License

Damvia is released under the [GNU Affero General Public License v3.0](https://github.com/damviaHQ/damvia/blob/v1.0.0/LICENSE).

---

Developed with ❤️ by [Hive Horizon](https://www.hivehorizon.com)

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
// Items in the shape each cloud API returns them, for the sync driver tests.
const { FOLDER_MIME } = require('../../dist/asset-updater/google-drive-items')

const dropbox = {
    folder: (id, p) => ({ '.tag': 'folder', id, name: p.split('/').pop(), path_lower: p.toLowerCase(), path_display: p }),
    file: (id, p, size = 10, hash = 'h') => ({ '.tag': 'file', id, name: p.split('/').pop(), path_lower: p.toLowerCase(), path_display: p, size, content_hash: hash }),
}
const googleDrive = {
    folder: (id, name, parent) => ({ id, name, mimeType: FOLDER_MIME, parents: [parent] }),
    file: (id, name, parent, extra = {}) => ({ id, name, mimeType: 'image/jpeg', parents: [parent], size: '10', md5Checksum: 'md5-' + id, ...extra }),
}
const oneDrive = {
    ref: id => ({ driveId: 'drive', id }),
}
module.exports = { dropbox, googleDrive, oneDrive, FOLDER_MIME }

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
export const formatFileSize = (sizeInBytes: number) => {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`
  } else if (sizeInBytes < 1024 ** 2) {
    return `${(sizeInBytes / 1024).toFixed(0)} KB`
  } else if (sizeInBytes < 1024 ** 3) {
    return `${(sizeInBytes / (1024 ** 2)).toFixed(0)} MB`
  }
  return `${(sizeInBytes / (1024 ** 3)).toFixed(0)} GB`
}

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

// How tall a picture is allowed to be, in pixels: the author drags the picture
// itself rather than choosing among fixed words. Kept free of zod so the
// client can read these limits without shipping the validation library.
export const MIN_IMAGE_HEIGHT = 80
export const MAX_IMAGE_HEIGHT = 2400
export const DEFAULT_IMAGE_HEIGHT = 420

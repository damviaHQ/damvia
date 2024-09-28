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
import { rm } from "node:fs/promises"
import sharp from "sharp"
import { logger, mainS3, mainS3Bucket } from "../../env"
import { tmpFile } from "../../services/asset"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export default router({
  getAuthBackgroundUploadUrl: publicProcedure
    .use(authMiddleware(userAdmin))
    .query(async () => {
      const key = 'settings/auth-background-temp'
      return mainS3().presignedPutObject(mainS3Bucket(), key, 24 * 60 * 60)
    }),
  processAuthBackgroundImage: publicProcedure
    .use(authMiddleware(userAdmin))
    .mutation(async () => {
      const tempKey = 'settings/auth-background-temp'
      const finalKey = 'settings/auth-background.webp'
      const tempFilePath = await tmpFile()
      const processedFilePath = await tmpFile()

      try {
        await mainS3().fGetObject(mainS3Bucket(), tempKey, tempFilePath)

        await sharp(tempFilePath)
          .resize({ height: 2000, fit: 'inside' })
          .webp({ quality: 80 })
          .toFile(processedFilePath)

        await mainS3().fPutObject(mainS3Bucket(), finalKey, processedFilePath, {
          'Content-Type': 'image/webp'
        })

        await mainS3().removeObject(mainS3Bucket(), tempKey)

        return { success: true }
      } catch (error) {
        logger.error("Failed to process auth background image", { error })
        throw new Error("Failed to process auth background image")
      } finally {
        // Clean up local temporary files
        await Promise.all([
          rm(tempFilePath).catch(() => { }),
          rm(processedFilePath).catch(() => { })
        ])
      }
    }),
  getAuthBackgroundImage: publicProcedure
    .query(async () => {
      const authBackgroundStorageKey = 'settings/auth-background.webp'
      try {
        // Check if the object exists
        await mainS3().statObject(mainS3Bucket(), authBackgroundStorageKey)

        // If we reach here, the object exists, so generate a URL
        const url = await mainS3().presignedGetObject(mainS3Bucket(), authBackgroundStorageKey, 24 * 60 * 60)
        return { imageUrl: url, exists: true }
      } catch (error) {
        // Check if the error indicates that the object doesn't exist
        if (error.code === 'NotFound') {
          // Image doesn't exist
          return { imageUrl: null, exists: false }
        }
        // For other errors, log and return null
        logger.error('Error checking auth background image:', error)
        return { imageUrl: null, exists: false }
      }
    }),
  removeAuthBackgroundImage: publicProcedure
    .use(authMiddleware(userAdmin))
    .mutation(async () => {
      const key = 'settings/auth-background.webp'
      try {
        await mainS3().removeObject(mainS3Bucket(), key)
        return { success: true }
      } catch (error) {
        logger.error("Failed to remove auth background image", { error })
        throw new Error("Failed to remove auth background image")
      }
    }),
})

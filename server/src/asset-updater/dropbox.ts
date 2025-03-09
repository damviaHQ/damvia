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
import { Dropbox, DropboxAuth, files } from 'dropbox'
import { writeFile } from "fs/promises"
import { lookup } from 'mime-types'
import path from 'path'
import { In, Not } from "typeorm"
import { AssetFile, AssetFileStatus } from "../entity/asset-file"
import { AssetFolder, AssetFolderStatus } from "../entity/asset-folder"
import { dataSource, logger } from "../env"
import { tmpFile, upsertFile, upsertFolder } from "../services/asset"
import AssetUpdater from "./base"

export default class DropboxAssetUpdater extends AssetUpdater {
  private client: Dropbox
  private auth: DropboxAuth

  constructor(
    private readonly appKey: string,
    private readonly appSecret: string,
    private readonly refreshToken: string,
  ) {
    super()
    this.auth = new DropboxAuth({
      clientId: this.appKey,
      clientSecret: this.appSecret,
      refreshToken: this.refreshToken,
    })
    this.client = new Dropbox({ auth: this.auth })
  }

  async initialize() {
    try {
      await this.auth.refreshAccessToken()
      logger.info('Dropbox token refreshed successfully')
    } catch (error) {
      logger.error('Failed to refresh Dropbox token', { error })
      throw error
    }
  }

  async fetchUpdates() {
    let cursor: string | undefined = undefined
    const syncFolderIds: string[] = []
    const syncFileIds: string[] = []
    const folderPathToId: Record<string, string> = {}
    const allFolders: files.FolderMetadataReference[] = []
    const allFiles: files.FileMetadataReference[] = []
    
    try {
      // First pass: collect all entries
      do {
        let response;
        
        if (!cursor) {
          // Initial request
          response = await this.client.filesListFolder({
            path: '',
            recursive: true,
            include_deleted: false,
          });
        } else {
          // Continue from previous request using cursor
          response = await this.client.filesListFolderContinue({
            cursor
          });
        }

        logger.info(`Fetched ${response.result.entries.length} entries from Dropbox`);

        // Collect folders and files
        for (const entry of response.result.entries) {
          if (entry.name.startsWith('.')) {
            continue;
          }

          if ('id' in entry) {
            if (entry['.tag'] === 'folder') {
              allFolders.push(entry as files.FolderMetadataReference);
            } else if (entry['.tag'] === 'file') {
              allFiles.push(entry as files.FileMetadataReference);
            }
          }
        }

        cursor = response.result.has_more ? response.result.cursor : undefined;
      } while (cursor);

      // Sort folders by path depth to ensure parents are processed before children
      allFolders.sort((a, b) => {
        const pathA = (a as files.FolderMetadata).path_display || '';
        const pathB = (b as files.FolderMetadata).path_display || '';
        const depthA = pathA.split('/').filter(Boolean).length;
        const depthB = pathB.split('/').filter(Boolean).length;
        return depthA - depthB;
      });

      // Pre-process: ensure all parent paths exist in our mapping
      // This handles cases where a parent folder might not be included in the API response
      for (const folder of allFolders) {
        const folderPath = (folder as files.FolderMetadata).path_display || '';
        // Use lowercase path as key to handle case sensitivity issues
        const folderPathKey = folderPath.toLowerCase();
        folderPathToId[folderPathKey] = folder.id;
        
        // Store the original path to ID mapping for reference
        folderPathToId[`original_${folderPathKey}`] = folderPath;
        
        // Ensure all parent paths in the hierarchy are accounted for
        let currentPath = folderPath;
        while (currentPath !== '/' && currentPath !== '') {
          const parentPath = path.dirname(currentPath);
          const parentPathKey = parentPath.toLowerCase();
          
          if (parentPath !== '/' && parentPath !== '' && !(parentPathKey in folderPathToId)) {
            // Mark parent paths that need to be created with a special prefix
            folderPathToId[parentPathKey] = `needs_creation_${parentPath}`;
            // Store the original path
            folderPathToId[`original_${parentPathKey}`] = parentPath;
          }
          currentPath = parentPath;
        }
      }

      // Create any missing parent folders first
      const createdFolders: Record<string, AssetFolder> = {};
      for (const folderPathKey in folderPathToId) {
        // Skip the original path references
        if (folderPathKey.startsWith('original_')) {
          continue;
        }
        
        const folderId = folderPathToId[folderPathKey];
        if (folderId.startsWith('needs_creation_')) {
          try {
            // Get the original path for display and folder creation
            const folderPath = folderPathToId[`original_${folderPathKey}`] || folderPathKey;
            const folderName = path.basename(folderPath);
            const parentPath = path.dirname(folderPath);
            const parentPathKey = parentPath.toLowerCase();
            let parentExternalId = '';
            
            if (parentPath !== '/' && parentPath !== '') {
              // Parent should already be in our mapping or created
              if (parentPathKey in createdFolders) {
                parentExternalId = createdFolders[parentPathKey].externalId;
              } else if (parentPathKey in folderPathToId) {
                const parentId = folderPathToId[parentPathKey];
                if (!parentId.startsWith('needs_creation_')) {
                  parentExternalId = parentId;
                } else {
                  // This shouldn't happen with proper sorting, but just in case
                  logger.warn(`Parent folder ${parentPath} not yet created for ${folderPath}`);
                  parentExternalId = `generated_${parentPath}`;
                }
              }
            }
            
            const newFolder = await upsertFolder({
              externalId: `generated_${folderPath}`,
              parentExternalId,
              name: folderName,
            });
            
            // Update our mappings
            folderPathToId[folderPathKey] = newFolder.externalId;
            createdFolders[folderPathKey] = newFolder;
            syncFolderIds.push(newFolder.id);
            
            logger.info(`Created placeholder folder for ${folderPath}`);
            
            // Add a small delay to reduce the likelihood of deadlocks
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            logger.error('Error creating placeholder folder', {
              error: error.message,
              stack: error.stack,
              folderPath: folderPathToId[`original_${folderPathKey}`] || folderPathKey
            });
          }
        }
      }

      // Process all actual folders from Dropbox
      for (const folder of allFolders) {
        try {
          const folderAsset = await this.upsertFolder(folder, folderPathToId, createdFolders);
          syncFolderIds.push(folderAsset.id);
          
          // Add a small delay to reduce the likelihood of deadlocks
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.error('Error processing Dropbox folder', {
            error: error.message,
            stack: error.stack,
            entry: folder
          });
        }
      }

      // Process all files
      for (const file of allFiles) {
        try {
          const fileAsset = await this.upsertFile(file, folderPathToId, createdFolders);
          if (fileAsset) {
            syncFileIds.push(fileAsset.id);
          }
        } catch (error) {
          logger.error('Error processing Dropbox file', {
            error: error.message,
            stack: error.stack,
            entry: file
          });
        }
      }

      await dataSource.getRepository(AssetFolder).update(
        { id: Not(In(syncFolderIds)) },
        { status: AssetFolderStatus.PENDING_DELETION }
      );
      await dataSource.getRepository(AssetFile).update(
        { id: Not(In(syncFileIds)) },
        { status: AssetFileStatus.PENDING_DELETION }
      );
    } catch (error) {
      if (error.status === 401) {
        logger.warn('Dropbox token expired, attempting to refresh');
        await this.initialize();
        return this.fetchUpdates();
      }
      logger.error('Failed to update Dropbox assets', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async fetchFileContent(file: AssetFile): Promise<string> {
    try {
      const response = await this.client.filesDownload({ path: file.externalId })
      const fileContent = (response.result as any).fileBinary
      const tempFilePath = await tmpFile()
      await writeFile(tempFilePath, fileContent)
      return tempFilePath
    } catch (error) {
      if (error.status === 401) {
        logger.warn('Dropbox token expired, attempting to refresh')
        await this.initialize()
        return this.fetchFileContent(file)
      }
      throw error
    }
  }

  private async upsertFolder(
    entry: files.FolderMetadataReference, 
    folderPathToId: Record<string, string>,
    createdFolders: Record<string, AssetFolder> = {}
  ): Promise<AssetFolder> {
    const folderPath = (entry as files.FolderMetadata).path_display || '';
    const folderPathKey = folderPath.toLowerCase();
    const folderName = path.basename(folderPath);
    const parentPath = path.dirname(folderPath);
    const parentPathKey = parentPath.toLowerCase();

    // Find parent folder ID
    let parentExternalId = '';
    if (parentPath !== '/' && parentPath !== '') {
      // First check if we've already created this parent
      if (parentPathKey in createdFolders) {
        parentExternalId = createdFolders[parentPathKey].externalId;
      } else if (parentPathKey in folderPathToId) {
        // Use the parent path to get the parent ID from our mapping
        parentExternalId = folderPathToId[parentPathKey];
        
        // If the parent ID indicates it needs creation, create it now
        if (parentExternalId.startsWith('needs_creation_')) {
          logger.warn(`Parent folder not found for ${folderPath}, creating placeholder`);
          
          // Create a placeholder parent folder
          const parentFolderName = path.basename(parentPath);
          const grandparentPath = path.dirname(parentPath);
          const grandparentPathKey = grandparentPath.toLowerCase();
          let grandparentExternalId = '';
          
          if (grandparentPath !== '/' && grandparentPath !== '') {
            if (grandparentPathKey in createdFolders) {
              grandparentExternalId = createdFolders[grandparentPathKey].externalId;
            } else if (grandparentPathKey in folderPathToId) {
              grandparentExternalId = folderPathToId[grandparentPathKey];
              if (grandparentExternalId.startsWith('needs_creation_')) {
                grandparentExternalId = `generated_${grandparentPath}`;
              }
            } else {
              grandparentExternalId = `generated_${grandparentPath}`;
            }
          }
          
          // Add retry logic for creating placeholder parent folder
          let retries = 3;
          let placeholderParent;
          
          while (retries > 0) {
            try {
              placeholderParent = await upsertFolder({
                externalId: `generated_${parentPath}`,
                parentExternalId: grandparentExternalId,
                name: parentFolderName,
              });
              break; // Success, exit the retry loop
            } catch (error) {
              retries--;
              if (error.message && error.message.includes('deadlock detected') && retries > 0) {
                // If deadlock detected and we have retries left, wait and try again
                logger.warn(`Deadlock detected when creating placeholder parent folder for ${folderPath}, retrying... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, 500 * (4 - retries))); // Increasing backoff
              } else if (retries === 0) {
                // If we've exhausted retries, rethrow the error
                throw error;
              } else {
                // For other errors, rethrow immediately
                throw error;
              }
            }
          }
          
          // Update our mappings
          folderPathToId[parentPathKey] = placeholderParent.externalId;
          createdFolders[parentPathKey] = placeholderParent;
          parentExternalId = placeholderParent.externalId;
        }
      } else {
        // This shouldn't happen with our pre-processing, but just in case
        logger.warn(`Parent path ${parentPath} not found in mapping for ${folderPath}`);
        parentExternalId = `generated_${parentPath}`;
      }
    }

    // Add retry logic for upserting the folder
    let retries = 3;
    let folder;
    
    while (retries > 0) {
      try {
        // Always call upsertFolder to update the folder name and parent, even if it already exists
        folder = await upsertFolder({
          externalId: entry.id,
          parentExternalId,
          name: folderName,
        });
        break; // Success, exit the retry loop
      } catch (error) {
        retries--;
        if (error.message && error.message.includes('deadlock detected') && retries > 0) {
          // If deadlock detected and we have retries left, wait and try again
          logger.warn(`Deadlock detected when upserting folder ${folderPath}, retrying... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, 500 * (4 - retries))); // Increasing backoff
        } else if (retries === 0) {
          // If we've exhausted retries, rethrow the error
          throw error;
        } else {
          // For other errors, rethrow immediately
          throw error;
        }
      }
    }
    
    // Update our created folders mapping
    createdFolders[folderPathKey] = folder;
    
    return folder;
  }

  private async upsertFile(
    entry: files.FileMetadataReference, 
    folderPathToId: Record<string, string>,
    createdFolders: Record<string, AssetFolder> = {}
  ): Promise<AssetFile> {
    const fileName = entry.name;
    const filePath = (entry as files.FileMetadata).path_display || '';
    const folderPath = path.dirname(filePath);
    const folderPathKey = folderPath.toLowerCase();
    
    // Get folder from our mappings
    let folderExternalId = '';
    
    // First check if we've already created this folder
    if (folderPathKey in createdFolders) {
      folderExternalId = createdFolders[folderPathKey].externalId;
    } else if (folderPathKey in folderPathToId) {
      folderExternalId = folderPathToId[folderPathKey];
      
      // If the folder ID indicates it needs creation, create it now
      if (folderExternalId.startsWith('needs_creation_')) {
        logger.warn(`Folder not found for file ${filePath}, creating placeholder`);
        
        // Create the folder if it doesn't exist
        const folderName = path.basename(folderPath);
        const parentPath = path.dirname(folderPath);
        const parentPathKey = parentPath.toLowerCase();
        let parentExternalId = '';
        
        if (parentPath !== '/' && parentPath !== '') {
          if (parentPathKey in createdFolders) {
            parentExternalId = createdFolders[parentPathKey].externalId;
          } else if (parentPathKey in folderPathToId) {
            parentExternalId = folderPathToId[parentPathKey];
            if (parentExternalId.startsWith('needs_creation_')) {
              parentExternalId = `generated_${parentPath}`;
            }
          } else {
            parentExternalId = `generated_${parentPath}`;
          }
        }
        
        // Add retry logic for creating placeholder folder
        let retries = 3;
        let newFolder;
        
        while (retries > 0) {
          try {
            newFolder = await upsertFolder({
              externalId: `generated_${folderPath}`,
              parentExternalId,
              name: folderName,
            });
            break; // Success, exit the retry loop
          } catch (error) {
            retries--;
            if (error.message && error.message.includes('deadlock detected') && retries > 0) {
              // If deadlock detected and we have retries left, wait and try again
              logger.warn(`Deadlock detected when creating placeholder folder for file ${filePath}, retrying... (${retries} retries left)`);
              await new Promise(resolve => setTimeout(resolve, 500 * (4 - retries))); // Increasing backoff
            } else if (retries === 0) {
              // If we've exhausted retries, rethrow the error
              throw error;
            } else {
              // For other errors, rethrow immediately
              throw error;
            }
          }
        }
        
        // Update our mappings
        folderPathToId[folderPathKey] = newFolder.externalId;
        createdFolders[folderPathKey] = newFolder;
        folderExternalId = newFolder.externalId;
      }
    } else {
      // This shouldn't happen with our pre-processing, but just in case
      logger.warn(`Folder path ${folderPath} not found in mapping for file ${filePath}`);
      
      // Create the folder if it doesn't exist
      const folderName = path.basename(folderPath);
      const parentPath = path.dirname(folderPath);
      const parentPathKey = parentPath.toLowerCase();
      let parentExternalId = '';
      
      if (parentPath !== '/' && parentPath !== '') {
        if (parentPathKey in createdFolders) {
          parentExternalId = createdFolders[parentPathKey].externalId;
        } else if (parentPathKey in folderPathToId) {
          parentExternalId = folderPathToId[parentPathKey];
          if (parentExternalId.startsWith('needs_creation_')) {
            parentExternalId = `generated_${parentPath}`;
          }
        } else {
          parentExternalId = `generated_${parentPath}`;
        }
      }
      
      // Add retry logic for creating missing folder
      let retries = 3;
      let newFolder;
      
      while (retries > 0) {
        try {
          newFolder = await upsertFolder({
            externalId: `generated_${folderPath}`,
            parentExternalId,
            name: folderName,
          });
          break; // Success, exit the retry loop
        } catch (error) {
          retries--;
          if (error.message && error.message.includes('deadlock detected') && retries > 0) {
            // If deadlock detected and we have retries left, wait and try again
            logger.warn(`Deadlock detected when creating missing folder for file ${filePath}, retrying... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 500 * (4 - retries))); // Increasing backoff
          } else if (retries === 0) {
            // If we've exhausted retries, rethrow the error
            throw error;
          } else {
            // For other errors, rethrow immediately
            throw error;
          }
        }
      }
      
      folderExternalId = newFolder.externalId;
      createdFolders[folderPathKey] = newFolder;
    }

    // Add retry logic for upserting the file
    let retries = 3;
    let file;
    
    while (retries > 0) {
      try {
        file = await upsertFile({
          externalId: entry.id,
          externalChecksum: (entry as files.FileMetadata).content_hash,
          folderExternalId,
          name: fileName,
          size: (entry as files.FileMetadata).size,
          mimeType: lookup(fileName) || 'application/octet-stream',
        });
        break; // Success, exit the retry loop
      } catch (error) {
        retries--;
        if (error.message && error.message.includes('deadlock detected') && retries > 0) {
          // If deadlock detected and we have retries left, wait and try again
          logger.warn(`Deadlock detected when upserting file ${filePath}, retrying... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, 500 * (4 - retries))); // Increasing backoff
        } else if (retries === 0) {
          // If we've exhausted retries, rethrow the error
          throw error;
        } else {
          // For other errors, rethrow immediately
          throw error;
        }
      }
    }
    
    return file;
  }
}
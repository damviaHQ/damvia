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
import { fromFile as fileTypeFromFile } from "file-type"
import ffmpeg from "fluent-ffmpeg"
import { exec } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { v4 as uuid } from 'uuid'
import { AssetFile, AssetFileStatus } from "../entity/asset-file"
import { AssetFolder, AssetFolderStatus } from "../entity/asset-folder"
import { Collection } from "../entity/collection"
import { CollectionFile } from "../entity/collection-file"
import { Product } from "../entity/product"
import { assetsS3, assetsS3Bucket, assetUpdater, dataSource, logger } from "../env"
import { assetUpdateContentQueue, collectionSynchronizationQueue } from "../worker"

let _tmpDir = null
export async function tmpDir() {
	if (!_tmpDir) {
		_tmpDir = await mkdtemp(join(tmpdir(), 'dam-asset'))
	}
	return _tmpDir
}

export async function tmpFile() {
	return join(await tmpDir(), uuid())
}

export async function updateFileContent(file: AssetFile): Promise<void> {
	const contentPath = await assetUpdater().fetchFileContent(file)
	const fileType = await fileTypeFromFile(contentPath)
	file.mimeType = fileType?.ext === 'webp' ? 'image/webp' : (fileType?.mime ?? 'application/octet-stream')
	await assetsS3().fPutObject(assetsS3Bucket(), file.originalStorageKey, contentPath, { 'Content-Type': file.mimeType })

	let thumbnailPath = null
	try {
		thumbnailPath = await generateFileThumbnail(file, contentPath)
		if (thumbnailPath === null && file.hasThumbnail) {
			file.hasThumbnail = false
			await assetsS3().removeObjects(assetsS3Bucket(), [file.thumbnailStorageKey])
		} else if (thumbnailPath) {
			await assetsS3().fPutObject(assetsS3Bucket(), file.thumbnailStorageKey, thumbnailPath, { 'Content-Type': 'image/webp' })
			if (!file.hasThumbnail) {
				file.hasThumbnail = true
			}
		}
	} catch (error) {
		logger.error(`Failed to generate thumbnail for ${file.name}`, { error: error.message })
	}

	try {
		const dimensions = await extractDimensions(file, contentPath)
		if (dimensions) {
			file.width = dimensions.width
			file.height = dimensions.height
		}
	} catch (error) {
		logger.error(`Failed to extract dimensions for ${file.name}`, { error: error.message })
	}

	file.status = AssetFileStatus.UP_TO_DATE
	await dataSource.getRepository(AssetFile).save(file)
	
	if (thumbnailPath) {
		rm(thumbnailPath).catch((error) => logger.error("Failed to delete thumbnail", { error: error.message }))
	}
	rm(contentPath).catch((error) => logger.error("Failed to delete file", { error: error.message }))
}

export async function generateFileThumbnail(file: AssetFile, contentPath: string): Promise<string | null> {
	const extension = file.name.split('.').pop()?.toLowerCase();
	
	const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
	const isVideo = file.mimeType.startsWith('video/') || 
				   (extension && videoExtensions.includes(extension));
	
	const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif'];
	const isImage = file.mimeType.startsWith('image/') || 
				   (extension && imageExtensions.includes(extension));
				
	const vectorExtensions = ['eps', 'ai', 'pdf', 'svg'];
	const isVector = file.mimeType === 'application/postscript' || 
					file.mimeType === 'application/pdf' ||
					file.mimeType === 'application/illustrator' ||
					file.mimeType === 'image/svg+xml' ||
					(extension && vectorExtensions.includes(extension));
	
	const pptExtensions = ['ppt', 'pptx', 'ppsx', 'pps', 'potx', 'pot'];
	const isPowerPoint = file.mimeType === 'application/vnd.ms-powerpoint' || 
					    file.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
					    file.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.slideshow' ||
					    (extension && pptExtensions.includes(extension));
	
	const wordExtensions = ['doc', 'docx', 'rtf', 'odt'];
	const isWord = file.mimeType === 'application/msword' || 
				  file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
				  file.mimeType === 'application/rtf' ||
				  file.mimeType === 'application/vnd.oasis.opendocument.text' ||
				  (extension && wordExtensions.includes(extension));
	
	const excelExtensions = ['xls', 'xlsx', 'csv', 'ods'];
	const isExcel = file.mimeType === 'application/vnd.ms-excel' || 
				   file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
				   file.mimeType === 'application/vnd.oasis.opendocument.spreadsheet' ||
				   (extension && excelExtensions.includes(extension));
	
	if (isVideo) {
		try {
			const thumbnailFolder = await tmpDir();
			const thumbnailFiles = await new Promise<string[]>((resolve, reject) => {
				let _filenames = [];
				ffmpeg(contentPath).thumbnail({
					count: 1,
					folder: thumbnailFolder,
					size: '1280x?',
					timestamps: ['10%'],
					filename: 'thumbnail-%b.png'
				})
					.on('filenames', (filenames) => _filenames = filenames)
					.on('error', (err) => {
						logger.error(`FFmpeg error for ${file.name}`, { error: err.message });
						reject(err);
					})
					.on('end', () => resolve(_filenames));
			});
			
			if (thumbnailFiles.length === 0) {
				return null;
			}
			
			return join(thumbnailFolder, thumbnailFiles[0]);
		} catch (error) {
			logger.error(`Error generating video thumbnail for ${file.name}`, { 
				error: error.message, 
				stack: error.stack 
			});
			return null;
		}
	} else if (isImage) {
		try {
			const thumbnailPath = await tmpFile();
			const fileSize = parseInt(file.size, 10);
			
			if (fileSize > 50 * 1024 * 1024) {
				try {
					await sharp(contentPath, { limitInputPixels: 0 })
						.resize({ height: 1280 })
						.toFormat('webp')
						.toFile(thumbnailPath);
				} catch (error) {
					await sharp(contentPath, { limitInputPixels: 0 })
						.resize({ height: 640 })
						.toFormat('webp')
						.toFile(thumbnailPath);
				}
			} else {
				await sharp(contentPath)
					.resize({ height: 1280 })
					.toFormat('webp')
					.toFile(thumbnailPath);
			}
			
			return thumbnailPath;
		} catch (error) {
			logger.error(`Error generating image thumbnail for ${file.name}`, { 
				error: error.message, 
				stack: error.stack 
			});
			return null;
		}
	} else if (isVector) {
		try {
			const tempPngPath = await tmpFile();
			const thumbnailPath = await tmpFile();
			
			if (extension === 'svg' || file.mimeType === 'image/svg+xml') {
				try {
					await sharp(contentPath, { limitInputPixels: 0 })
						.resize({ height: 1280 })
						.toFormat('png')
						.toFile(tempPngPath);
				} catch (error) {
					logger.error(`Error generating vector thumbnail for ${file.name}`, { 
						error: error.message, 
						stack: error.stack 
					});
					return null;
				}
			} else if (extension === 'pdf' || file.mimeType === 'application/pdf') {
				try {
					const fileSize = parseInt(file.size, 10);
					const resolution = fileSize > 50 * 1024 * 1024 ? 72 : 150;
					
					await new Promise<void>((resolve, reject) => {
						const cmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -dGraphicsAlphaBits=4 -dFirstPage=1 -dLastPage=1 -r${resolution} -sOutputFile="${tempPngPath}" "${contentPath}"`;
						exec(cmd, (error) => {
							if (error) {
								logger.error(`Ghostscript error for ${file.name}`, { error: error.message });
								reject(error);
							} else {
								resolve();
							}
						});
					});
				} catch (error) {
					logger.error(`Error generating PDF thumbnail for ${file.name}`, { 
						error: error.message, 
						stack: error.stack 
					});
					return null;
				}
			} else {
				try {
					await new Promise<void>((resolve, reject) => {
						const cmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -dGraphicsAlphaBits=4 -dEPSCrop -r150 -sOutputFile="${tempPngPath}" "${contentPath}"`;
						exec(cmd, (error) => {
							if (error) {
								logger.error(`Ghostscript error for ${file.name}`, { error: error.message });
								reject(error);
							} else {
								resolve();
							}
						});
					});
				} catch (error) {
					logger.error(`Error generating vector thumbnail for ${file.name}`, { 
						error: error.message, 
						stack: error.stack 
					});
					return null;
				}
			}
			
			try {
				await sharp(tempPngPath, { limitInputPixels: 0 })
					.resize({ height: 1280 })
					.toFormat('webp')
					.toFile(thumbnailPath);
				
				rm(tempPngPath).catch((error) => 
					logger.error("Failed to delete temporary PNG", { error: error.message })
				);
				
				return thumbnailPath;
			} catch (error) {
				logger.error(`Error processing vector thumbnail for ${file.name}`, { 
					error: error.message, 
					stack: error.stack 
				});
				return null;
			}
		} catch (error) {
			logger.error(`Error generating vector thumbnail for ${file.name}`, { 
				error: error.message, 
				stack: error.stack 
			});
			return null;
		}
	} else if (isWord) {
		try {
			const thumbnailPath = await tmpFile();
			
			const wordTempDir = join(await tmpDir(), `word_${uuid()}`);
			
			await new Promise<void>((resolve, reject) => {
				const mkdirCmd = process.platform === 'win32' 
					? `mkdir "${wordTempDir}"` 
					: `mkdir -p "${wordTempDir}"`;
				
				exec(mkdirCmd, (mkdirError) => {
					if (mkdirError) {
						logger.error(`Error creating temporary directory for ${file.name}`, { error: mkdirError.message });
						reject(mkdirError);
					} else {
						resolve();
					}
				});
			});
			
			const safeFilename = `word_${uuid()}.${extension}`;
			const safeTempPath = join(wordTempDir, safeFilename);
			
			await new Promise<void>((resolve, reject) => {
				const copyCmd = process.platform === 'win32' 
					? `copy "${contentPath}" "${safeTempPath}"` 
					: `cp "${contentPath}" "${safeTempPath}"`;
				
				exec(copyCmd, (copyError) => {
					if (copyError) {
						logger.error(`Error copying Word file: ${file.name}`, { error: copyError.message });
						reject(copyError);
					} else {
						resolve();
					}
				});
			});
			
			try {
				const tempPngPath = join(wordTempDir, `${safeFilename.substring(0, safeFilename.lastIndexOf('.'))}.png`);
				
				await new Promise<void>((resolve, reject) => {
					const cmd = `soffice --headless --convert-to png --outdir "${wordTempDir}" "${safeTempPath}"`;
					exec(cmd, (error) => {
						if (error) {
							reject(error);
						} else {
							resolve();
						}
					});
				});
				
				await sharp(tempPngPath)
					.resize({ height: 1280 })
					.flatten({ background: { r: 255, g: 255, b: 255 } })
					.toFormat('webp')
					.toFile(thumbnailPath);
				
				rm(tempPngPath).catch((error) => 
					logger.error("Failed to delete temporary PNG", { error: error.message })
				);
				
				rm(safeTempPath, { force: true }).catch(e => 
					logger.error("Failed to delete temporary Word file", { error: e.message })
				);
				
				rm(wordTempDir, { recursive: true, force: true }).catch(e => 
					logger.error("Failed to delete temporary directory", { error: e.message })
				);
				
				return thumbnailPath;
			} catch (directExportError) {
				try {
					await new Promise<void>((resolve, reject) => {
						const cmd = `soffice --headless --convert-to pdf --outdir "${wordTempDir}" "${safeTempPath}"`;
						exec(cmd, (error) => {
							if (error) {
								logger.error(`LibreOffice PDF export failed for ${file.name}`, { error: error.message });
								reject(error);
								return;
							}
							resolve();
						});
					});
					
					const pdfFilename = safeFilename.substring(0, safeFilename.lastIndexOf('.')) + '.pdf';
					const pdfPath = join(wordTempDir, pdfFilename);
					
					const tempImagePath = join(wordTempDir, 'word_preview');
					
					await new Promise<void>((resolve, reject) => {
						exec('which pdftoppm', async (whichError) => {
							if (whichError) {
								const gsCmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -dGraphicsAlphaBits=4 -dFirstPage=1 -dLastPage=1 -r300 -sOutputFile="${join(wordTempDir, 'word_preview.png')}" "${pdfPath}"`;
								exec(gsCmd, (gsError) => {
									if (gsError) {
										logger.error(`Ghostscript error for Word PDF: ${pdfFilename}`, { error: gsError.message });
										reject(gsError);
									} else {
										resolve();
									}
								});
							} else {
								const pdftoppmCmd = `pdftoppm -png -singlefile -f 1 -l 1 "${pdfPath}" "${tempImagePath}"`;
								exec(pdftoppmCmd, (pdftoppmError) => {
									if (pdftoppmError) {
										logger.error(`pdftoppm error for Word PDF: ${pdfFilename}`, { error: pdftoppmError.message });
										reject(pdftoppmError);
									} else {
										resolve();
									}
								});
							}
						});
					});
					
					let imageFile = join(wordTempDir, 'word_preview.png');
					if (!existsSync(imageFile)) {
						imageFile = join(wordTempDir, 'word_preview-1.png');
						if (!existsSync(imageFile)) {
							throw new Error('Generated image file not found');
						}
					}
					
					await sharp(imageFile)
						.resize({ height: 1280 })
						.flatten({ background: { r: 255, g: 255, b: 255 } })
						.toFormat('webp')
						.toFile(thumbnailPath);
					
					rm(pdfPath, { force: true }).catch(e => 
						logger.error("Failed to delete temporary PDF", { error: e.message })
					);
					rm(imageFile, { force: true }).catch(e => 
						logger.error("Failed to delete temporary image", { error: e.message })
					);
					rm(safeTempPath, { force: true }).catch(e => 
						logger.error("Failed to delete temporary Word file", { error: e.message })
					);
					
					rm(wordTempDir, { recursive: true, force: true }).catch(e => 
						logger.error("Failed to delete temporary directory", { error: e.message })
					);
					
					return thumbnailPath;
				} catch (pdfExportError) {
					logger.error(`PDF export and conversion failed for ${file.name}`, { 
						error: pdfExportError.message 
					});
					
					try {
						const svgImage = `
						<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
							<rect width="100%" height="100%" fill="#ffffff"/>
							<text x="50%" y="50%" font-family="Arial" font-size="24" fill="#333" text-anchor="middle">
								Word Document: ${file.name.replace(/[<>&"']/g, (c) => {
									return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c];
								})}
							</text>
						</svg>`;
						
						const svgBuffer = Buffer.from(svgImage);
						await sharp(svgBuffer)
							.resize({ height: 1280 })
							.flatten({ background: { r: 255, g: 255, b: 255 } })
							.toFormat('webp')
							.toFile(thumbnailPath);
						
						rm(wordTempDir, { recursive: true, force: true }).catch(e => 
							logger.error("Failed to delete temporary directory", { error: e.message })
						);
						
						return thumbnailPath;
					} catch (fallbackError) {
						logger.error(`All Word thumbnail generation methods failed for ${file.name}`, { 
							error: fallbackError.message 
						});
						return null;
					}
				}
			}
		} catch (error) {
			logger.error(`Error generating Word document thumbnail for ${file.name}`, { 
				error: error.message, 
				stack: error.stack 
			});
			return null;
		}
	} else if (isExcel) {
		try {
			const thumbnailPath = await tmpFile();
			
			const excelTempDir = join(await tmpDir(), `excel_${uuid()}`);
			
			await new Promise<void>((resolve, reject) => {
				const mkdirCmd = process.platform === 'win32' 
					? `mkdir "${excelTempDir}"` 
					: `mkdir -p "${excelTempDir}"`;
				
				exec(mkdirCmd, (mkdirError) => {
					if (mkdirError) {
						logger.error(`Error creating temporary directory for ${file.name}`, { error: mkdirError.message });
						reject(mkdirError);
					} else {
						resolve();
					}
				});
			});
			
			const safeFilename = `excel_${uuid()}.${extension}`;
			const safeTempPath = join(excelTempDir, safeFilename);
			
			await new Promise<void>((resolve, reject) => {
				const copyCmd = process.platform === 'win32' 
					? `copy "${contentPath}" "${safeTempPath}"` 
					: `cp "${contentPath}" "${safeTempPath}"`;
				
				exec(copyCmd, (copyError) => {
					if (copyError) {
						logger.error(`Error copying Excel file: ${file.name}`, { error: copyError.message });
						reject(copyError);
					} else {
						resolve();
					}
				});
			});
			
			try {
				const tempPngPath = join(excelTempDir, `${safeFilename.substring(0, safeFilename.lastIndexOf('.'))}.png`);
				
				await new Promise<void>((resolve, reject) => {
					const cmd = `soffice --headless --convert-to png --outdir "${excelTempDir}" "${safeTempPath}"`;
					exec(cmd, (error) => {
						if (error) {
							reject(error);
						} else {
							resolve();
						}
					});
				});
				
				await sharp(tempPngPath)
					.resize({ height: 1280 })
					.toFormat('webp')
					.toFile(thumbnailPath);
				
				rm(tempPngPath).catch((error) => 
					logger.error("Failed to delete temporary PNG", { error: error.message })
				);
				
				rm(safeTempPath, { force: true }).catch(e => 
					logger.error("Failed to delete temporary Excel file", { error: e.message })
				);
				
				rm(excelTempDir, { recursive: true, force: true }).catch(e => 
					logger.error("Failed to delete temporary directory", { error: e.message })
				);
				
				return thumbnailPath;
			} catch (directExportError) {
				try {
					await new Promise<void>((resolve, reject) => {
						const cmd = `soffice --headless --convert-to pdf --outdir "${excelTempDir}" "${safeTempPath}"`;
						exec(cmd, (error) => {
							if (error) {
								logger.error(`LibreOffice PDF export failed for ${file.name}`, { error: error.message });
								reject(error);
								return;
							}
							resolve();
						});
					});
					
					const pdfFilename = safeFilename.substring(0, safeFilename.lastIndexOf('.')) + '.pdf';
					const pdfPath = join(excelTempDir, pdfFilename);
					
					const tempImagePath = join(excelTempDir, 'excel_preview');
					
					await new Promise<void>((resolve, reject) => {
						exec('which pdftoppm', async (whichError) => {
							if (whichError) {
								const gsCmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -dGraphicsAlphaBits=4 -dFirstPage=1 -dLastPage=1 -r300 -sOutputFile="${join(excelTempDir, 'excel_preview.png')}" "${pdfPath}"`;
								exec(gsCmd, (gsError) => {
									if (gsError) {
										logger.error(`Ghostscript error for Excel PDF: ${pdfFilename}`, { error: gsError.message });
										reject(gsError);
									} else {
										resolve();
									}
								});
							} else {
								const pdftoppmCmd = `pdftoppm -png -singlefile -f 1 -l 1 "${pdfPath}" "${tempImagePath}"`;
								exec(pdftoppmCmd, (pdftoppmError) => {
									if (pdftoppmError) {
										logger.error(`pdftoppm error for Excel PDF: ${pdfFilename}`, { error: pdftoppmError.message });
										reject(pdftoppmError);
									} else {
										resolve();
									}
								});
							}
						});
					});
					
					let imageFile = join(excelTempDir, 'excel_preview.png');
					if (!existsSync(imageFile)) {
						imageFile = join(excelTempDir, 'excel_preview-1.png');
						if (!existsSync(imageFile)) {
							throw new Error('Generated image file not found');
						}
					}
					
					await sharp(imageFile)
						.resize({ height: 1280 })
						.toFormat('webp')
						.toFile(thumbnailPath);
					
					rm(pdfPath, { force: true }).catch(e => 
						logger.error("Failed to delete temporary PDF", { error: e.message })
					);
					rm(imageFile, { force: true }).catch(e => 
						logger.error("Failed to delete temporary image", { error: e.message })
					);
					rm(safeTempPath, { force: true }).catch(e => 
						logger.error("Failed to delete temporary Excel file", { error: e.message })
					);
					
					rm(excelTempDir, { recursive: true, force: true }).catch(e => 
						logger.error("Failed to delete temporary directory", { error: e.message })
					);
					
					return thumbnailPath;
				} catch (pdfExportError) {
					logger.error(`PDF export and conversion failed for ${file.name}`, { 
						error: pdfExportError.message 
					});
					
					try {
						const svgImage = `
						<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
							<rect width="100%" height="100%" fill="#f3f3f3"/>
							<text x="50%" y="50%" font-family="Arial" font-size="24" fill="#333" text-anchor="middle">
								Excel Spreadsheet: ${file.name.replace(/[<>&"']/g, (c) => {
									return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c];
								})}
							</text>
						</svg>`;
						
						const svgBuffer = Buffer.from(svgImage);
						await sharp(svgBuffer)
							.resize({ height: 1280 })
							.toFormat('webp')
							.toFile(thumbnailPath);
						
						rm(excelTempDir, { recursive: true, force: true }).catch(e => 
							logger.error("Failed to delete temporary directory", { error: e.message })
						);
						
						return thumbnailPath;
					} catch (fallbackError) {
						logger.error(`All Excel thumbnail generation methods failed for ${file.name}`, { 
							error: fallbackError.message 
						});
						return null;
					}
				}
			}
		} catch (error) {
			logger.error(`Error generating Excel spreadsheet thumbnail for ${file.name}`, { 
				error: error.message, 
				stack: error.stack 
			});
			return null;
		}
	} else if (isPowerPoint) {
		try {
			const thumbnailPath = await tmpFile();
			
			const powerPointTempDir = join(await tmpDir(), `ppt_${uuid()}`);
			
			await new Promise<void>((resolve, reject) => {
				const mkdirCmd = process.platform === 'win32' 
					? `mkdir "${powerPointTempDir}"` 
					: `mkdir -p "${powerPointTempDir}"`;
				
				exec(mkdirCmd, (mkdirError) => {
					if (mkdirError) {
						logger.error(`Error creating temporary directory for ${file.name}`, { error: mkdirError.message });
						reject(mkdirError);
					} else {
						resolve();
					}
				});
			});
			
			const safeFilename = `powerpoint_${uuid()}.${extension}`;
			const safeTempPath = join(powerPointTempDir, safeFilename);
			
			await new Promise<void>((resolve, reject) => {
				const copyCmd = process.platform === 'win32' 
					? `copy "${contentPath}" "${safeTempPath}"` 
					: `cp "${contentPath}" "${safeTempPath}"`;
				
				exec(copyCmd, (copyError) => {
					if (copyError) {
						logger.error(`Error copying PowerPoint file: ${file.name}`, { error: copyError.message });
						reject(copyError);
					} else {
						resolve();
					}
				});
			});
			
			try {
				const tempPngPath = join(powerPointTempDir, `${safeFilename.substring(0, safeFilename.lastIndexOf('.'))}.png`);
				
				await new Promise<void>((resolve, reject) => {
					const fileSize = parseInt(file.size, 10);
					const timeout = fileSize > 50 * 1024 * 1024 ? 60000 : 30000;
					
					const cmd = `soffice --headless --convert-to png --outdir "${powerPointTempDir}" "${safeTempPath}"`;
					const process = exec(cmd, { timeout }, (error) => {
						if (error) {
							reject(error);
						} else {
							resolve();
						}
					});
				}).catch(async (error) => {
					const fileSize = parseInt(file.size, 10);
					const pdfPath = join(powerPointTempDir, `powerpoint_${uuid()}.pdf`);
					await new Promise<void>((resolve, reject) => {
						const cmd = `soffice --headless --convert-to pdf --outdir "${powerPointTempDir}" "${safeTempPath}"`;
						exec(cmd, (error) => {
							if (error) {
								logger.error(`LibreOffice PDF export failed for ${file.name}`, { error: error.message });
								reject(error);
							} else {
								resolve();
							}
						});
					});
					
					const imageFile = join(powerPointTempDir, 'ppt_preview.png');
					await new Promise<void>((resolve, reject) => {
						const resolution = fileSize > 50 * 1024 * 1024 ? 72 : 150;
						const cmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -dGraphicsAlphaBits=4 -dFirstPage=1 -dLastPage=1 -r${resolution} -sOutputFile="${imageFile}" "${pdfPath}"`;
						exec(cmd, (error) => {
							if (error) {
								logger.error(`PDF export and conversion failed for ${file.name}`, { error: error.message });
								reject(error);
							} else {
								resolve();
							}
						});
					});
					
					if (!existsSync(imageFile)) {
						throw new Error('Generated image file not found');
					}
					
					await sharp(imageFile, { limitInputPixels: 0 })
						.resize({ height: 1280 })
						.toFormat('webp')
						.toFile(thumbnailPath);
					
					rm(pdfPath, { force: true }).catch(e => 
						logger.error("Failed to delete temporary PDF", { error: e.message })
					);
					rm(imageFile, { force: true }).catch(e => 
						logger.error("Failed to delete temporary image", { error: e.message })
					);
					
					return thumbnailPath;
				});
				
				await sharp(tempPngPath, { limitInputPixels: 0 })
					.resize({ height: 1280 })
					.toFormat('webp')
					.toFile(thumbnailPath);
				
				rm(tempPngPath).catch((error) => 
					logger.error("Failed to delete temporary PNG", { error: error.message })
				);
				
				rm(safeTempPath, { force: true }).catch(e => 
					logger.error("Failed to delete temporary PowerPoint file", { error: e.message })
				);
				
				rm(powerPointTempDir, { recursive: true, force: true }).catch(e => 
					logger.error("Failed to delete temporary directory", { error: e.message })
				);
				
				return thumbnailPath;
			} catch (error) {
				logger.error(`Error generating PowerPoint thumbnail for ${file.name}`, { 
					error: error.message, 
					stack: error.stack 
				});
				
				rm(safeTempPath, { force: true }).catch(() => {});
				rm(powerPointTempDir, { recursive: true, force: true }).catch(() => {});
				
				return null;
			}
		} catch (error) {
			logger.error(`Error generating PowerPoint thumbnail for ${file.name}`, { 
				error: error.message, 
				stack: error.stack 
			});
			return null;
		}
	}
	
	return null;
}

export async function extractDimensions(file: AssetFile, contentPath: string): Promise<{ width: number, height: number } | null> {
	if (file.mimeType.startsWith('video/')) {
		return new Promise((resolve) => {
			ffmpeg.ffprobe(contentPath, (err, metadata) => {
				if (err) {
					resolve(null)
					return
				}

				const { width, height } = metadata.streams.find(stream => stream.codec_type === 'video') ?? {}
				if (width && height) {
					resolve({ width, height })
					return
				}
				resolve(null)
			})
		})
	} else if (file.mimeType.startsWith('image/')) {
		try {
			const isTiff = file.mimeType === 'image/tiff' || 
						  file.name.toLowerCase().endsWith('.tiff') || 
						  file.name.toLowerCase().endsWith('.tif');
			
			if (isTiff || parseInt(file.size, 10) > 50 * 1024 * 1024) {
				const meta = await sharp(contentPath, { 
					limitInputPixels: 0,
					pages: 1
				}).metadata();
				return { width: meta.width, height: meta.height };
			} else {
				const meta = await sharp(contentPath).metadata();
				return { width: meta.width, height: meta.height };
			}
		} catch (error) {
			logger.error(`Error extracting dimensions for ${file.name}`, { 
				error: error.message, 
				stack: error.stack 
			});
			return null;
		}
	}
	return null
}

export async function processDeletion() {
	const filesToDelete = await dataSource.getRepository(AssetFile).findBy({
		status: AssetFileStatus.PENDING_DELETION
	})
	for (const file of filesToDelete) {
		await deleteFile(file.id)
	}

	const foldersToDelete = await dataSource.getRepository(AssetFolder).findBy({
		status: AssetFolderStatus.PENDING_DELETION,
	})
	for (const folder of foldersToDelete) {
		await deleteFolder(folder.id)
	}
}

export type UpsertFolderOptions = {
	externalId: string
	parentExternalId: string
	name: string
}

export async function upsertFolder(opts: UpsertFolderOptions): Promise<AssetFolder> {
	let folder = await dataSource.getRepository(AssetFolder).findOne({
		where: { externalId: opts.externalId },
		relations: { parent: { collections: true }, collections: true },
	})
	const alreadyExists = !!folder
	if (!folder) {
		folder = new AssetFolder()
		folder.externalId = opts.externalId
		folder.status = AssetFolderStatus.UP_TO_DATE
	}

	const folderNameChanged = folder.name !== opts.name
	folder.name = opts.name
	const previousParent = folder.parent
	if (folder.parent?.externalId !== opts.parentExternalId) {
		folder.parent = await dataSource.getRepository(AssetFolder).findOne({
			where: { externalId: opts.parentExternalId },
			relations: { collections: true },
		})
	}
	const parentChanged = previousParent?.id !== folder.parent?.id

	if (!alreadyExists || parentChanged) {
		folder.licenseId = folder.parent?.licenseId
		folder.assetTypeId = folder.parent?.assetTypeId
	}

	await dataSource.getRepository(AssetFolder).save(folder)
	if (folderNameChanged || parentChanged || !alreadyExists) {
		const jobs = [
			...(folder.collections?.map((c) => ({ data: { collectionId: c.id } })) ?? []),
			...(folder.parent?.collections?.map((c) => ({ data: { collectionId: c.id } })) ?? []),
			...(parentChanged && previousParent
				? previousParent.collections?.map((c) => ({ data: { collectionId: c.id } }))
				: []
			),
		]
		if (jobs.length > 0) {
			await collectionSynchronizationQueue.bulkPush(jobs)
		}
	}
	return folder
}

export async function deleteFolder(folderId: string): Promise<void> {
	const folder = await dataSource.getRepository(AssetFolder).findOne({
		where: { id: folderId },
		relations: ['children', 'files'],
	})
	for (const child of folder.children) {
		await deleteFolder(child.id)
	}
	for (const file of folder.files) {
		await deleteFile(file.id)
	}
	await dataSource.getRepository(Collection).delete({ assetFolderId: folder.id })
	await dataSource.getRepository(AssetFolder).remove(folder)
}

export type UpsertFileOptions = {
	externalId: string
	externalChecksum: string
	folderExternalId: string
	name: string
	size: number
	mimeType: string
}

export async function upsertFile(opts: UpsertFileOptions): Promise<AssetFile> {
	let file = await dataSource.getRepository(AssetFile).findOne({
		where: { externalId: opts.externalId },
		relations: { folder: { collections: true } },
	})
	if (!file) {
		file = new AssetFile()
		file.externalId = opts.externalId
		file.status = AssetFileStatus.CREATING
	}

	const previousFolder = file.folder
	file.name = opts.name
	file.size = opts.size.toString()
	file.folder = await dataSource.getRepository(AssetFolder).findOne({
		where: { externalId: opts.folderExternalId },
		relations: { collections: true },
	})
	file.licenseId = file.folder?.licenseId
	file.assetTypeId = file.folder?.assetTypeId
	file.mimeType = opts.mimeType
	file.externalChecksum = opts.externalChecksum
	if (file.externalChecksum !== opts.externalChecksum && file.status !== AssetFileStatus.CREATING) {
		file.status = AssetFileStatus.OUTDATED
	}
	await dataSource.getRepository(AssetFile).save(file)

	if (file.externalChecksum !== opts.externalChecksum || file.status === AssetFileStatus.CREATING) {
		await assetUpdateContentQueue.push({ assetFileId: file.id })
	}

	const folderChanged = previousFolder?.id !== file.folder?.id
	if (folderChanged || file.status === AssetFileStatus.CREATING) {
		if (folderChanged) {
			await dataSource.query(`DELETE FROM collection_files WHERE asset_file_id = $1`, [file.id])
		}

		await dataSource.query(`
			INSERT INTO collection_files (asset_file_id, collection_id)
			SELECT $1, id FROM collections
			WHERE asset_folder_id = $2
			ON CONFLICT DO NOTHING
		`, [file.id, file.folder?.id])
	}
	return file
}

export async function deleteFile(fileId: string): Promise<void> {
	const file = await dataSource.getRepository(AssetFile).findOneBy({ id: fileId })
	await dataSource.transaction(async (em) => {
		await em.getRepository(CollectionFile).delete({ assetFileId: file.id })
		await em.getRepository(AssetFile).remove(file)
		await assetsS3().removeObjects(assetsS3Bucket(), [file.originalStorageKey, file.thumbnailStorageKey])
	})
}

export async function assignProductsToAssetFiles() {
	const regexString = process.env.PRODUCT_MATCHING_REGEX
	if (!regexString) {
		console.error('PRODUCT_MATCHING_REGEX is not defined in the environment variables')
		return
	}
	const regex = new RegExp(regexString)
	const assetFiles = await dataSource.getRepository(AssetFile).find({
		relations: { assetType: true },
	})

	for (const assetFile of assetFiles) {
		const match = assetFile.name.match(regex)
		if (!match) {
			continue
		}

		const [, productKey, productView] = match
		const product = await dataSource.getRepository(Product).findOneBy({ productKey })
		if (!product) {
			continue
		}

		assetFile.product = product
		assetFile.productView = productView || null

		await dataSource.getRepository(AssetFile).save(assetFile)
	}
}

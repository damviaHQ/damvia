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
import { exec } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { v4 as uuid } from 'uuid'
import { AssetFile } from "../entity/asset-file"

declare module 'libreoffice-convert' {
    export function convert(
        buffer: Buffer,
        format: string,
        filter: string | undefined,
        callback: (err: Error | null, result: Buffer) => void
    ): void;
}
import * as libre from 'libreoffice-convert'

export const LIBREOFFICE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'pps', 'ppsx', 'potx', 'pot', 'html', 'htm', 'xml', 'json', 'md', 'yaml', 'yml', 'txt', 'css', 'js', 'ts', 'csv'];
export const GHOSTSCRIPT_EXTENSIONS = ['pdf', 'eps', 'ai'];
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif', 'svg', 'psd'];
export const FONT_EXTENSIONS = ['ttf', 'otf'];

export const LIBREOFFICE_MIMETYPES = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'text/plain',
    'text/html',
    'text/xml',
    'application/json',
    'text/markdown',
    'text/yaml',
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/typescript',
    'text/csv',
    'application/csv'
];

export const GHOSTSCRIPT_MIMETYPES = [
    'application/pdf',
    'application/postscript',
    'application/illustrator'
];

export const VIDEO_MIMETYPES = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/x-ms-wmv',
    'video/x-flv',
    'video/webm'
];

export const IMAGE_MIMETYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/tiff',
    'image/svg+xml',
    'image/vnd.adobe.photoshop',
    'application/photoshop',
    'application/psd',
    'image/psd'
];

export const FONT_MIMETYPES = [
    'font/ttf',
    'font/otf',
    'application/x-font-ttf',
    'application/x-font-otf',
    'application/vnd.ms-fontobject'
];

/**
 * Checks if a file is of a specific type based on extension and MIME type
 * @param file The asset file to check
 * @param extensions Array of supported extensions
 * @param mimeTypes Array of supported MIME types
 * @returns True if the file matches any of the supported types
 */
export function isFileType(
    file: AssetFile,
    extensions: string[],
    mimeTypes: string[]
): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return (extension && extensions.includes(extension)) || mimeTypes.includes(file.mimeType);
}

const libreConvert = (buffer: Buffer, format: string, filter?: string): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        libre.convert(buffer, format, filter, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
};

/**
 * Converts an office document to PNG format using libreoffice-convert
 * @param file The asset file to convert
 * @param contentPath Path to the file content
 * @param tmpFile Function to generate a temporary file path
 * @param tmpDir Function to generate a temporary directory path
 * @param maxSizeBytes Maximum file size in bytes (files larger than this will be skipped)
 * @returns Path to the generated PNG file or null if conversion failed
 */
export async function convertOfficeToPng(
    file: AssetFile, 
    contentPath: string, 
    tmpFile: () => Promise<string>,
    tmpDir: () => Promise<string>,
    maxSizeBytes: number = 1024 * 1024 * 1024
): Promise<string | null> {
    const fileSize = parseInt(file.size, 10);
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (!isFileType(file, LIBREOFFICE_EXTENSIONS, LIBREOFFICE_MIMETYPES)) {
        return null;
    }
    
    const textExtensions = ['txt', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'yaml', 'yml'];
    const isTextFile = extension && textExtensions.includes(extension);
    
    if (fileSize > maxSizeBytes) {
        return null;
    }
    
    try {
        const docBuffer = await readFile(contentPath);
        const pdfPath = await tmpFile();
        
        try {
            if (['ppt', 'pptx', 'pps', 'ppsx', 'potx', 'pot'].includes(extension || '') || 
                file.mimeType === 'application/vnd.ms-powerpoint' || 
                file.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                file.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.slideshow') {
                const pdfBuffer = await libreConvert(docBuffer, '.pdf', 'impress_pdf_Export');
                await writeFile(pdfPath, pdfBuffer);
            } else {
                const pdfBuffer = await libreConvert(docBuffer, '.pdf', undefined);
                await writeFile(pdfPath, pdfBuffer);
            }
        } catch (pdfError) {
            if (fileSize > 50 * 1024 * 1024) {
                
                try {
                    const tempDir = await tmpDir();
                    const tempInputPath = join(tempDir, `input_${uuid()}.${extension}`);
                    await writeFile(tempInputPath, docBuffer);
                    
                    await new Promise<void>((resolve, reject) => {
                        const timeout = 120000; // 2 minutes timeout
                        const cmd = `timeout ${timeout / 1000} soffice --headless --convert-to pdf --outdir "${tempDir}" "${tempInputPath}"`;
                        exec(cmd, (error) => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        });
                    });
                    
                    const pdfFilename = `input_${uuid()}.pdf`;
                    const generatedPdfPath = join(tempDir, pdfFilename);
                    
                    if (existsSync(generatedPdfPath)) {
                        const pdfContent = await readFile(generatedPdfPath);
                        await writeFile(pdfPath, pdfContent);
                        
                        rm(tempInputPath, { force: true }).catch(() => {});
                        rm(generatedPdfPath, { force: true }).catch(() => {});
                    } else {
                        throw new Error('Generated PDF not found');
                    }
                } catch (fallbackError) {
                    if (isTextFile) {
                        return await generateTextSvgThumbnail(file, contentPath, tmpFile);
                    }
                    return null;
                }
            } else {
                if (isTextFile) {
                    return await generateTextSvgThumbnail(file, contentPath, tmpFile);
                }
                return null;
            }
        }
        
        const pngPath = await tmpFile();
        await new Promise<void>((resolve, reject) => {
            const cmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -dGraphicsAlphaBits=4 -dFirstPage=1 -dLastPage=1 -r150 -sOutputFile="${pngPath}" "${pdfPath}"`;
            exec(cmd, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
        
        rm(pdfPath, { force: true }).catch(() => {});
        
        return pngPath;
    } catch (error) {
        if (isTextFile) {
            return await generateTextSvgThumbnail(file, contentPath, tmpFile);
        }
        return null;
    }
}

/**
 * Converts a PDF or vector file to PNG using Ghostscript
 * @param file The asset file to convert
 * @param contentPath Path to the file content
 * @param tmpFile Function to generate a temporary file path
 * @returns Path to the generated PNG file or null if conversion failed
 */
export async function convertVectorToPng(
    file: AssetFile, 
    contentPath: string, 
    tmpFile: () => Promise<string>
): Promise<string | null> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const fileSize = parseInt(file.size, 10);
    
    if (!isFileType(file, GHOSTSCRIPT_EXTENSIONS, GHOSTSCRIPT_MIMETYPES)) {
        return null;
    }
    
    try {
        const tempPngPath = await tmpFile();
        const resolution = fileSize > 50 * 1024 * 1024 ? 72 : 150;
        
        if (extension === 'pdf' || file.mimeType === 'application/pdf') {
            await new Promise<void>((resolve, reject) => {
                const cmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -dGraphicsAlphaBits=4 -dFirstPage=1 -dLastPage=1 -r${resolution} -sOutputFile="${tempPngPath}" "${contentPath}"`;
                exec(cmd, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
        } else {
            await new Promise<void>((resolve, reject) => {
                const cmd = `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -dGraphicsAlphaBits=4 -dEPSCrop -r${resolution} -sOutputFile="${tempPngPath}" "${contentPath}"`;
                exec(cmd, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
        }
        
        return tempPngPath;
    } catch (error) {
        return null;
    }
}

/**
 * Generates a thumbnail for a video file using FFmpeg
 * @param file The asset file to convert
 * @param contentPath Path to the file content
 * @param tmpFile Function to generate a temporary file path
 * @param tmpDir Function to generate a temporary directory path
 * @returns Path to the generated thumbnail or null if generation failed
 */
export async function generateVideoThumbnail(
    file: AssetFile, 
    contentPath: string, 
    tmpFile: () => Promise<string>,
    tmpDir: () => Promise<string>
): Promise<string | null> {
    if (!isFileType(file, VIDEO_EXTENSIONS, VIDEO_MIMETYPES)) {
        return null;
    }
    
    try {
        const thumbnailFolder = await tmpDir();
        const thumbnailFiles = await new Promise<string[]>((resolve, reject) => {
            let _filenames: string[] = [];
            const ffmpeg = require('fluent-ffmpeg');
            
            ffmpeg(contentPath).thumbnail({
                count: 1,
                folder: thumbnailFolder,
                size: '1280x?',
                timestamps: ['10%'],
                filename: 'thumbnail-%b.png'
            })
                .on('filenames', (filenames: string[]) => _filenames = filenames)
                .on('error', (err: Error) => reject(err))
                .on('end', () => resolve(_filenames));
        });
        
        if (thumbnailFiles.length === 0) {
            return null;
        }
        
        return join(thumbnailFolder, thumbnailFiles[0]);
    } catch (error) {
        return null;
    }
}

/**
 * Processes an image file to generate a thumbnail
 * @param file The asset file to process
 * @param contentPath Path to the file content
 * @param tmpFile Function to generate a temporary file path
 * @returns Path to the generated thumbnail or null if generation failed
 */
export async function processImageThumbnail(
    file: AssetFile, 
    contentPath: string, 
    tmpFile: () => Promise<string>
): Promise<string | null> {
    if (!isFileType(file, IMAGE_EXTENSIONS, IMAGE_MIMETYPES)) {
        return null;
    }
    
    try {
        const thumbnailPath = await tmpFile();
        const fileSize = parseInt(file.size, 10);
        const extension = file.name.split('.').pop()?.toLowerCase();
        const isPsd = extension === 'psd' || file.mimeType === 'image/vnd.adobe.photoshop' || 
                     file.mimeType === 'application/photoshop' || file.mimeType === 'application/psd' || 
                     file.mimeType === 'image/psd';
        
        if (isPsd) {
            try {
                await new Promise<void>((resolve, reject) => {
                    const cmd = `convert "${contentPath}[0]" -resize 1920x1280 -quality 85 "${thumbnailPath}.webp"`;
                    exec(cmd, (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
                
                return `${thumbnailPath}.webp`;
            } catch (psdError) {
                try {
                    await new Promise<void>((resolve, reject) => {
                        const cmd = `convert "${contentPath}" -flatten -resize 1920x1280 -quality 85 "${thumbnailPath}.webp"`;
                        exec(cmd, (error) => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        });
                    });
                    
                    return `${thumbnailPath}.webp`;
                } catch (fallbackError) {
                    return null;
                }
            }
        }
        
        const isLargeFile = fileSize > 10 * 1024 * 1024; // 10MB threshold

        if (isLargeFile) {
            try {
                await sharp(contentPath, { 
                    limitInputPixels: 0,
                    pages: 1,
                    failOn: 'none'
                })
                .resize({ 
                    height: 1280,
                    width: 1920,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toFormat('webp', { quality: 80 })
                .toFile(thumbnailPath);
                
                return thumbnailPath;
            } catch (largeImageError) {
                try {
                    await sharp(contentPath, { 
                        limitInputPixels: 0,
                        pages: 1,
                        failOn: 'none'
                    })
                    .resize({ 
                        height: 640,
                        width: 960,
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .toFormat('webp', { quality: 70 })
                    .toFile(thumbnailPath);
                    
                    return thumbnailPath;
                } catch (reducedSizeError) {
                    await sharp(contentPath, { 
                        limitInputPixels: 100000000,
                        pages: 1,
                        failOn: 'none'
                    })
                    .resize({ 
                        height: 320,
                        width: 480,
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .toFormat('webp', { quality: 60 })
                    .toFile(thumbnailPath);
                    
                    return thumbnailPath;
                }
            }
        } else {
            await sharp(contentPath)
                .resize({ 
                    height: 1280,
                    width: 1920,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toFormat('webp')
                .toFile(thumbnailPath);
            
            return thumbnailPath;
        }
    } catch (error) {
        return null;
    }
}

/**
 * Generates a text-based SVG thumbnail for a file
 * @param file The asset file to process
 * @param contentPath Path to the file content
 * @param tmpFile Function to generate a temporary file path
 * @returns Path to the generated thumbnail or null if generation failed
 */
export async function generateTextSvgThumbnail(
    file: AssetFile, 
    contentPath: string, 
    tmpFile: () => Promise<string>
): Promise<string | null> {
    try {
        const fileContent = await readFile(contentPath, 'utf-8');
        const truncatedContent = fileContent.substring(0, 2000);
        
        const svgContent = `
        <svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#f8f9fa"/>
            <style>
                .content { font-family: monospace; font-size: 14px; white-space: pre; }
                .filename { font-family: sans-serif; font-size: 18px; font-weight: bold; }
            </style>
            <text x="20" y="40" class="filename">${file.name.replace(/[<>&"']/g, c => {
                return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c];
            })}</text>
            <text x="20" y="80" class="content">${truncatedContent.replace(/[<>&"']/g, c => {
                return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c];
            })}</text>
        </svg>`;
        
        const thumbnailPath = await tmpFile();
        const svgBuffer = Buffer.from(svgContent);
        
        await sharp(svgBuffer)
            .resize({ height: 1280 })
            .toFormat('webp')
            .toFile(thumbnailPath);
        
        return thumbnailPath;
    } catch (error) {
        return null;
    }
}

/**
 * Processes a font file to generate a thumbnail showing sample text
 * @param file The asset file to process
 * @param contentPath Path to the file content
 * @param tmpFile Function to generate a temporary file path
 * @returns Path to the generated thumbnail or null if generation failed
 */
export async function processFontThumbnail(
    file: AssetFile, 
    contentPath: string, 
    tmpFile: () => Promise<string>
): Promise<string | null> {
    if (!isFileType(file, FONT_EXTENSIONS, FONT_MIMETYPES)) {
        return null;
    }
    
    try {
        const thumbnailPath = await tmpFile();
        const sampleText = `ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n1234567890\nThe quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs.\nSphynx of black quartz, judge my vow.`;
        
        await new Promise<void>((resolve, reject) => {
            const cmd = `convert -size 1920x1280 -background white -fill black -font "${contentPath}" -pointsize 48 -gravity center label:"${sampleText}" -quality 90 "${thumbnailPath}.webp"`;
            exec(cmd, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
        
        return `${thumbnailPath}.webp`;
    } catch (error) {
        try {
            const fallbackThumbnailPath = await tmpFile();
            const simpleSampleText = `Font: ${file.name}\n\nABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n1234567890`;
            await new Promise<void>((resolve, reject) => {
                const cmd = `convert -size 1280x720 -background white -fill black -pointsize 36 -gravity center label:"${simpleSampleText}" -quality 85 "${fallbackThumbnailPath}.webp"`;
                exec(cmd, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
            
            return `${fallbackThumbnailPath}.webp`;
        } catch (fallbackError) {
            return null;
        }
    }
} 
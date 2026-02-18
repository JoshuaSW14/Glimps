/**
 * Storage Service
 * Phase 2: File storage (local filesystem, S3-ready architecture)
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { StorageError } from '../../utils/errors';
import { Modality } from '../../types';

export interface StoredFile {
  path: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export class StorageService {
  private storagePath: string;
  
  constructor(storagePath?: string) {
    this.storagePath = storagePath || config.storagePath;
  }
  
  /**
   * Initialize storage (create directories)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.mkdir(path.join(this.storagePath, 'voice'), { recursive: true });
      await fs.mkdir(path.join(this.storagePath, 'image'), { recursive: true });
      
      logger.info('Storage initialized', { path: this.storagePath });
    } catch (error) {
      throw new StorageError('Failed to initialize storage', { error });
    }
  }
  
  /**
   * Store an uploaded file
   */
  async storeFile(
    file: Express.Multer.File,
    modality: Modality
  ): Promise<StoredFile> {
    try {
      // Generate unique filename
      const ext = path.extname(file.originalname);
      const filename = `${uuidv4()}${ext}`;
      const subdir = modality === 'voice' ? 'voice' : 'image';
      const relativePath = path.join(subdir, filename);
      const absolutePath = path.join(this.storagePath, relativePath);
      
      // Write file
      await fs.writeFile(absolutePath, file.buffer);
      
      logger.info('File stored', {
        filename,
        originalName: file.originalname,
        size: file.size,
        path: relativePath,
      });
      
      return {
        path: relativePath,
        filename,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (error) {
      throw new StorageError('Failed to store file', { error });
    }
  }
  
  /**
   * Store a file from buffer (e.g. signed upload flow).
   * Uses fileKey for path (userId/timestamp-random.ext); modality from extension.
   */
  async storeFileFromBuffer(
    buffer: Buffer,
    fileKey: string,
    mimeType: string
  ): Promise<StoredFile> {
    const ext = path.extname(fileKey).toLowerCase();
    const voiceExts = ['.m4a', '.mp4', '.mp3', '.wav', '.webm'];
    const subdir = voiceExts.includes(ext) ? 'voice' : 'image';
    const basename = path.basename(fileKey) || `upload-${Date.now()}${ext}`;
    const relativePath = path.join(subdir, basename);
    const absolutePath = path.join(this.storagePath, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    logger.info('File stored from buffer', {
      path: relativePath,
      size: buffer.length,
    });

    return {
      path: relativePath,
      filename: basename,
      originalName: basename,
      size: buffer.length,
      mimeType,
    };
  }

  /**
   * Read a file from storage
   */
  async readFile(relativePath: string): Promise<Buffer> {
    try {
      const absolutePath = path.join(this.storagePath, relativePath);
      return await fs.readFile(absolutePath);
    } catch (error) {
      throw new StorageError(`Failed to read file: ${relativePath}`, { error });
    }
  }
  
  /**
   * Delete a file from storage
   */
  async deleteFile(relativePath: string): Promise<void> {
    try {
      const absolutePath = path.join(this.storagePath, relativePath);
      await fs.unlink(absolutePath);
      
      logger.info('File deleted', { path: relativePath });
    } catch (error) {
      logger.warn('Failed to delete file', { path: relativePath, error });
      // Don't throw - deletion failure shouldn't break the flow
    }
  }
  
  /**
   * Get absolute path for a file
   */
  getAbsolutePath(relativePath: string): string {
    return path.join(this.storagePath, relativePath);
  }
  
  /**
   * Check if file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const absolutePath = path.join(this.storagePath, relativePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}

export const storageService = new StorageService();

/**
 * EXIF extraction for images (captured_at from DateTimeOriginal or CreateDate)
 */

import exifr from 'exifr';
import { logger } from './logger';

/**
 * Read capture date from image file. Prefers DateTimeOriginal, then CreateDate.
 * Returns null if no date found or on error.
 */
export async function getCaptureDateFromExif(imagePath: string): Promise<Date | null> {
  try {
    const tags = await exifr.parse(imagePath, ['DateTimeOriginal', 'CreateDate']);
    if (!tags) return null;
    const date = tags.DateTimeOriginal ?? tags.CreateDate;
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch (err) {
    logger.debug('EXIF read failed (non-fatal)', { imagePath, error: err });
    return null;
  }
}

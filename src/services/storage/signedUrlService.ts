/**
 * Signed URL Service
 * Production Hardening Phase 3: Time-limited upload URLs; no permanent public URLs.
 */

import crypto from 'crypto';
import { config } from '../../config';

export interface SignedUploadData {
  fileKey: string;
  uploadPath: string;
  signature: string;
  expiresAt: number;
}

export class SignedUrlService {
  /**
   * Generate a signed upload path and metadata for a client upload.
   * Client will PUT to /api/upload/signed?fileKey=...&signature=...&expires=...
   */
  generateUpload(userId: string, fileType: 'voice' | 'image'): SignedUploadData {
    const fileKey = `${userId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${fileType === 'voice' ? 'm4a' : 'jpg'}`;
    const expiresAt = Date.now() + config.signedUrlExpiry * 1000;
    const signature = this.sign(fileKey, expiresAt);
    const uploadPath = `/api/upload/signed`;
    return {
      fileKey,
      uploadPath,
      signature,
      expiresAt,
    };
  }

  /**
   * Verify that the request to upload is valid (signature and not expired).
   */
  verify(fileKey: string, signature: string, expires: number): boolean {
    if (Date.now() > expires) return false;
    const expected = this.sign(fileKey, expires);
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    // timingSafeEqual requires equal-length buffers; mismatch length → invalid
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  }

  private sign(fileKey: string, expiresAt: number): string {
    return crypto
      .createHmac('sha256', config.jwtSecret)
      .update(`${fileKey}:${expiresAt}`)
      .digest('hex');
  }
}

export const signedUrlService = new SignedUrlService();

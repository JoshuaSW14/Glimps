/**
 * Auth Service
 * Server-side verification of Apple and Google provider tokens.
 * Backend verifies the provider-issued JWT, then issues its own session token.
 * Never trust client-supplied user IDs — always extract sub from a verified token.
 */

import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { OAuth2Client } from 'google-auth-library';
import { getPool } from '../../db';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface UserPayload {
  userId: string;
  email?: string;
}

export interface AuthResult {
  userId: string;
  email?: string;
  name?: string;
}

// Apple JWKS client — caches keys with a 10-minute TTL
const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000, // 10 minutes
  rateLimit: true,
});

// Google client — audience is validated per call
const googleOAuthClient = new OAuth2Client();

export class AuthService {
  generateToken(payload: UserPayload): string {
    return jwt.sign(
      payload,
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
    );
  }

  verifyToken(token: string): UserPayload {
    return jwt.verify(token, config.jwtSecret) as UserPayload;
  }

  /**
   * SECURITY: Verify Apple identity token server-side using Apple's JWKS.
   * Validates iss, aud (bundle ID), exp. Returns the stable Apple sub.
   */
  async verifyAppleToken(identityToken: string): Promise<{ sub: string; email?: string }> {
    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header?.kid) {
      throw new Error('Invalid Apple identity token format');
    }

    const decodedPayload = (decoded.payload && typeof decoded.payload === 'object')
      ? (decoded.payload as jwt.JwtPayload)
      : undefined;

    const key = await appleJwksClient.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    const appleAudiences = config.appleBundleId
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    // If APPLE_BUNDLE_ID is not set (dev/test), skip audience check
    const verifyOptions: jwt.VerifyOptions = {
      issuer: 'https://appleid.apple.com',
      algorithms: ['RS256'],
    };
    if (appleAudiences.length > 0) {
      const audienceValue: string | [string, ...string[]] = appleAudiences.length === 1
        ? appleAudiences[0]
        : (appleAudiences as [string, ...string[]]);
      verifyOptions.audience = audienceValue;

      // Helpful diagnostics before signature verification for clearer auth errors.
      const tokenAudience = decodedPayload?.aud;
      const audienceMatches = Array.isArray(tokenAudience)
        ? tokenAudience.some((aud) => appleAudiences.includes(aud))
        : typeof tokenAudience === 'string'
          ? appleAudiences.includes(tokenAudience)
          : false;

      if (tokenAudience && !audienceMatches) {
        throw new Error(
          `Apple token audience mismatch (expected one of ${appleAudiences.join(', ')}, received ${String(tokenAudience)})`
        );
      }
    } else {
      logger.warn('APPLE_BUNDLE_ID not set — skipping audience validation (dev only)');
    }

    const payload = jwt.verify(identityToken, publicKey, verifyOptions) as jwt.JwtPayload;
    if (!payload.sub) throw new Error('Apple token missing sub claim');

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  }

  /**
   * SECURITY: Verify Google id_token using google-auth-library.
   * Validates aud (client ID), iss, exp. Returns the stable Google sub.
   */
  async verifyGoogleToken(idToken: string): Promise<{ sub: string; email?: string; name?: string }> {
    // If GOOGLE_CLIENT_ID is not set (dev/test), skip audience check
    const audience = config.googleClientId || undefined;
    if (!audience) {
      logger.warn('GOOGLE_CLIENT_ID not set — skipping audience validation (dev only)');
    }

    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub) throw new Error('Google token missing sub claim');

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  }

  /**
   * Upsert a user by Apple provider ID. Returns internal user ID.
   */
  async authenticateApple(sub: string, email?: string, name?: string): Promise<AuthResult> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO users (apple_id, email, name, last_login_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (apple_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, users.email),
         name  = COALESCE(EXCLUDED.name,  users.name),
         last_login_at = NOW()
       RETURNING id, email, name`,
      [sub, email ?? null, name ?? null]
    );

    const row = result.rows[0];
    return { userId: row.id, email: row.email, name: row.name };
  }

  /**
   * Upsert a user by Google provider ID. Returns internal user ID.
   */
  async authenticateGoogle(sub: string, email?: string, name?: string): Promise<AuthResult> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO users (google_id, email, name, last_login_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (google_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, users.email),
         name  = COALESCE(EXCLUDED.name,  users.name),
         last_login_at = NOW()
       RETURNING id, email, name`,
      [sub, email ?? null, name ?? null]
    );

    const row = result.rows[0];
    return { userId: row.id, email: row.email, name: row.name };
  }
}

export const authService = new AuthService();

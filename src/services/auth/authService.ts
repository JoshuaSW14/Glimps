/**
 * Auth Service
 * Production Hardening Phase 2: JWT and Apple/Google user management
 * Backend receives provider credentials, creates/updates user, returns session token only.
 */

import jwt from 'jsonwebtoken';
import { getPool } from '../../db';
import { config } from '../../config';

export interface UserPayload {
  userId: string;
  email?: string;
}

export interface AuthResult {
  userId: string;
  email?: string;
  name?: string;
}

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

  async authenticateApple(
    appleUserId: string,
    email?: string,
    name?: string
  ): Promise<AuthResult> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO users (apple_id, email, name, last_login_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (apple_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, users.email),
         name = COALESCE(EXCLUDED.name, users.name),
         last_login_at = NOW()
       RETURNING id, email, name`,
      [appleUserId, email || null, name || null]
    );

    const row = result.rows[0];
    return {
      userId: row.id,
      email: row.email,
      name: row.name,
    };
  }

  async authenticateGoogle(
    googleUserId: string,
    email?: string,
    name?: string
  ): Promise<AuthResult> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO users (google_id, email, name, last_login_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (google_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, users.email),
         name = COALESCE(EXCLUDED.name, users.name),
         last_login_at = NOW()
       RETURNING id, email, name`,
      [googleUserId, email || null, name || null]
    );

    const row = result.rows[0];
    return {
      userId: row.id,
      email: row.email,
      name: row.name,
    };
  }
}

export const authService = new AuthService();

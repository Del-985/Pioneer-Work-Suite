import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import type { User } from '@shared/models/User';

interface JwtPayload {
  sub: string;
}

export type UserLookupFn = (id: string) => Promise<User | undefined>;
let lookupUserById: UserLookupFn | null = null;

// Called by AuthService once so we can look up users from JWTs
export function registerUserLookup(fn: UserLookupFn) {
  lookupUserById = fn;
}

export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;

    if (!lookupUserById) return next();

    const user = await lookupUserById(decoded.sub);
    if (user) {
      req.user = user;
    }
  } catch {
    // invalid token; ignore and continue as unauthenticated
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
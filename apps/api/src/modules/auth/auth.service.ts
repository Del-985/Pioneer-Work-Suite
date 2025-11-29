import type { User } from '@shared/models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { registerUserLookup } from '../../middleware/auth';

interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface StoredUser {
  user: User;
  passwordHash: string;
}

let users: StoredUser[] = [];
let idCounter = 1;

function signToken(user: User): string {
  return jwt.sign(
    { sub: user.id },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export class AuthService {
  constructor() {
    // so auth middleware can resolve users from tokens
    registerUserLookup(this.findUserById);
  }

  private async findUserById(id: string): Promise<User | undefined> {
    const found = users.find((u) => u.user.id === id);
    return found?.user;
  }

  async register(input: RegisterInput) {
    const existing = users.find((u) => u.user.email === input.email);
    if (existing) {
      const err = new Error('Email already in use') as any;
      err.status = 400;
      throw err;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user: User = {
      id: String(idCounter++),
      email: input.email,
      name: input.name,
    };

    users.push({ user, passwordHash });

    const token = signToken(user);

    return { user, token };
  }

  async login(input: LoginInput) {
    const stored = users.find((u) => u.user.email === input.email);
    if (!stored) {
      const err = new Error('Invalid credentials') as any;
      err.status = 401;
      throw err;
    }

    const ok = await bcrypt.compare(input.password, stored.passwordHash);
    if (!ok) {
      const err = new Error('Invalid credentials') as any;
      err.status = 401;
      throw err;
    }

    const token = signToken(stored.user);

    return { user: stored.user, token };
  }
}
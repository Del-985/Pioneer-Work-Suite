import type { User } from '@shared/models/User';

interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

interface LoginInput {
  email: string;
  password: string;
}

let users: User[] = []; // TEMP in-memory store
let idCounter = 1;

export class AuthService {
  async register(input: RegisterInput) {
    // TODO: replace with real DB + password hashing
    const existing = users.find((u) => u.email === input.email);
    if (existing) {
      const err = new Error('Email already in use') as any;
      err.status = 400;
      throw err;
    }

    const user: User = {
      id: String(idCounter++),
      email: input.email,
      name: input.name,
    };

    users.push(user);

    // TODO: issue real JWT instead of fake token
    const token = 'fake-token-' + user.id;

    return { user, token };
  }

  async login(input: LoginInput) {
    const user = users.find((u) => u.email === input.email);
    if (!user) {
      const err = new Error('Invalid credentials') as any;
      err.status = 401;
      throw err;
    }

    // TODO: check password properly
    const token = 'fake-token-' + user.id;

    return { user, token };
  }
}

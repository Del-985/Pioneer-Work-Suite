// apps/web/src/api/authApi.ts
import { http } from "./httpClient";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

/**
 * Call POST /auth/login
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await http.post<AuthResponse>("/auth/login", {
    email,
    password,
  });
  return data;
}

/**
 * Call POST /auth/register
 * (we'll use this later on the register page)
 */
export async function register(
  email: string,
  password: string,
  name: string
): Promise<AuthResponse> {
  const { data } = await http.post<AuthResponse>("/auth/register", {
    email,
    password,
    name,
  });
  return data;
}

/**
 * Call GET /auth/me
 * Returns just the user object, not a token.
 */
export async function getMe(): Promise<AuthUser> {
  const { data } = await http.get<{ user: AuthUser }>("/auth/me");
  return data.user;
}
import { http } from "./http";

export type UserRole = "student" | "professional";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthResponse {
  user: User;
  token: string;
}

/**
 * POST /auth/login
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await http.post<AuthResponse>("/auth/login", {
    email,
    password,
  });
  return data;
}

/**
 * POST /auth/register
 * (student-only for now on the backend)
 */
export async function register(
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  const { data } = await http.post<AuthResponse>("/auth/register", {
    name,
    email,
    password,
  });
  return data;
}

/**
 * GET /auth/me
 */
export async function getMe(): Promise<User> {
  const { data } = await http.get<{ user: User }>("/auth/me");
  return data.user;
}
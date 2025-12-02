export type UserRole = "student" | "professional";

export interface User {
  id: string;
  email: string;
  name: string;

  // For now we'll always set this to "student" in the auth flow.
  role: UserRole;
}
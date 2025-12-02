// apps/api/src/auth.ts
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

// For now, we'll hardcode a JWT secret.
// Later you can move this to an environment variable.
const JWT_SECRET = process.env.JWT_SECRET || "dev-student-secret-change-me";

type UserRole = "student";

interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface StoredUser {
  user: User;
  passwordHash: string;
}

// In-memory user store (MVP only)
// This will be replaced with a real database later.
const users: StoredUser[] = [];
let idCounter = 1;

// Helper: create JWT for a user
function signToken(user: User): string {
  return jwt.sign(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Middleware: attach user to request if token is valid
// (we'll use this for /auth/me and any future protected routes)
function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; role: string };
    const stored = users.find((u) => u.user.id === payload.sub);
    if (!stored) {
      return res.status(401).json({ error: "User not found" });
    }

    // Attach user to request (using any to avoid TS complexity for now)
    (req as any).user = stored.user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// POST /auth/register  (student-only for now)
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: "Missing email, password, or name" });
  }

  const existing = users.find((u) => u.user.email.toLowerCase() === String(email).toLowerCase());
  if (existing) {
    return res.status(400).json({ error: "Email already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user: User = {
    id: String(idCounter++),
    email,
    name,
    role: "student",
  };

  users.push({ user, passwordHash });

  const token = signToken(user);

  return res.status(201).json({ user, token });
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  const stored = users.find((u) => u.user.email.toLowerCase() === String(email).toLowerCase());
  if (!stored) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, stored.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken(stored.user);

  return res.json({ user: stored.user, token });
});

// GET /auth/me
router.get("/me", authMiddleware, (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }
  return res.json({ user });
});

export { router as authRouter, authMiddleware };
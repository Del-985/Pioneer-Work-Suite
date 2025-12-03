// apps/api/src/auth.ts
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";

const router = express.Router();

// For now, we'll hardcode a JWT secret.
// Later you can move this to a stronger secret in the environment.
const JWT_SECRET = process.env.JWT_SECRET || "dev-student-secret-change-me";

export type UserRole = "student";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

// Helper: create JWT for a user
function signToken(user: User): string {
  return jwt.sign(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Middleware: attach user to request if token is valid (DB-backed)
export async function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      role: string;
    };

    // Look up the user in the database
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!dbUser) {
      return res.status(401).json({ error: "User not found" });
    }

    const user: User = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: (dbUser.role as UserRole) || "student",
    };

    // Attach user to request (compatible with tasks/documents routes)
    (req as any).user = user;
    next();
  } catch (err) {
    console.error("authMiddleware error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// POST /auth/register  (student-only for now)
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ error: "Missing email, password, or name" });
  }

  const normalizedEmail = String(email).toLowerCase();

  try {
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: String(name),
        passwordHash,
        role: "student",
      },
    });

    const user: User = {
      id: created.id,
      email: created.email,
      name: created.name,
      role: "student",
    };

    const token = signToken(user);

    return res.status(201).json({ user, token });
  } catch (err) {
    console.error("Error in /auth/register:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  const normalizedEmail = String(email).toLowerCase();

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!dbUser) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, dbUser.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user: User = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: (dbUser.role as UserRole) || "student",
    };

    const token = signToken(user);

    return res.json({ user, token });
  } catch (err) {
    console.error("Error in /auth/login:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /auth/me
router.get("/me", authMiddleware, (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }
  return res.json({ user });
});

export { router as authRouter };
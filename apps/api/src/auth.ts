// apps/api/src/auth.ts
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { config } from "./config";
import { prisma } from "./prisma";

const router = express.Router();

export type UserRole = "student" | "professional";

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
    config.jwtSecret,
    { expiresIn: "7d" }
  );
}

function normalizeRole(value: unknown): UserRole {
  return value === "professional" ? "professional" : "student";
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
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
    const payload = jwt.verify(token, config.jwtSecret) as {
      sub?: string;
      role: string;
    };

    if (typeof payload.sub !== "string" || !payload.sub) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

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
      role: normalizeRole(dbUser.role),
    };

    // Attach user to request (compatible with tasks/documents routes)
    (req as any).user = user;
    next();
  } catch (_err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// POST /auth/register  (student-only for now)
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body || {};

  const normalizedEmail = normalizeEmail(email);
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedEmail) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (normalizedName.length < 1 || normalizedName.length > 120) {
    return res.status(400).json({ error: "Name must contain 1 to 120 characters" });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must contain 8 to 128 characters" });
  }

  try {
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedName,
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
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Email already in use" });
    }
    console.error("Error in /auth/register:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || typeof password !== "string" || password.length < 1 || password.length > 128) {
    return res.status(400).json({ error: "Missing email or password" });
  }

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
      role: normalizeRole(dbUser.role),
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

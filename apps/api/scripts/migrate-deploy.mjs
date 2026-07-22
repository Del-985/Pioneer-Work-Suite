import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
try {
  process.loadEnvFile?.(path.join(packageRoot, ".env"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const prismaExecutable = path.join(
  packageRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
);
const baselineMigration = "20260722000000_baseline_0_1_17";
const prisma = new PrismaClient();

function runPrisma(args) {
  const result = spawnSync(prismaExecutable, args, {
    cwd: packageRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(" ")} exited with ${result.status}`);
  }
}

try {
  const tables = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = current_schema()
      AND tablename IN ('User', '_prisma_migrations')
  `;
  const names = new Set(tables.map((row) => row.tablename));

  if (names.has("User") && !names.has("_prisma_migrations")) {
    console.log(
      `Existing pre-migration database detected; baselining ${baselineMigration}`
    );
    await prisma.$disconnect();
    runPrisma(["migrate", "resolve", "--applied", baselineMigration]);
  } else {
    await prisma.$disconnect();
  }

  runPrisma(["migrate", "deploy"]);
} catch (error) {
  await prisma.$disconnect().catch(() => undefined);
  console.error("Database migration deployment failed:", error);
  process.exitCode = 1;
}

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoots = ["apps/web/src", "apps/api/src"];
const sourceExtensions = new Set([".ts", ".tsx", ".css"]);

const lineBudgets = new Map([
  ["apps/web/src/pages/DocumentsPage.tsx", 1700],
  ["apps/web/src/pages/DashboardPage.tsx", 1050],
]);

function budgetFor(relativePath) {
  if (lineBudgets.has(relativePath)) return lineBudgets.get(relativePath);
  return path.extname(relativePath) === ".css" ? 1200 : 1000;
}

async function collectFiles(relativeDirectory) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(relativePath));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }
  return files;
}

const files = (await Promise.all(sourceRoots.map(collectFiles))).flat();
const violations = [];

for (const relativePath of files) {
  const source = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  const lines = source.split(/\r?\n/).length;
  const budget = budgetFor(relativePath);
  if (lines > budget) {
    violations.push(`${relativePath}: ${lines} lines (budget ${budget})`);
  }
}

if (violations.length > 0) {
  console.error("Maintainability budgets exceeded:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Maintainability budgets passed for ${files.length} source files.`);
}

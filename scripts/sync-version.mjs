import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const envPath = path.join(root, "apps", "web", ".env");
const webPackagePath = path.join(root, "apps", "web", "package.json");
const desktopPackagePath = path.join(root, "desktop", "package.json");
const cargoPath = path.join(root, "desktop", "src-tauri", "Cargo.toml");
const tauriConfigPath = path.join(
  root,
  "desktop",
  "src-tauri",
  "tauri.conf.json"
);

function readVersion() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing version source: ${envPath}`);
  }

  const env = fs.readFileSync(envPath, "utf8");

  const match = env.match(
    /^VITE_APP_VERSION\s*=\s*["']?([^"'\r\n#\s]+)["']?\s*$/m
  );

  if (!match?.[1]) {
    throw new Error(
      "apps/web/.env must contain VITE_APP_VERSION=x.y.z"
    );
  }

  const version = match[1].trim();

  if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(
      `Invalid semantic version "${version}". Use values like 0.1.2 or 1.0.0.`
    );
  }

  return version;
}

function updateJsonVersion(filePath, version) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  json.version = version;

  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

function updateCargoVersion(filePath, version) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  const source = fs.readFileSync(filePath, "utf8");
  const packageVersionPattern =
    /^(\[package\][\s\S]*?^version\s*=\s*)"([^"]*)"/m;
  const match = source.match(packageVersionPattern);

  if (!match) {
    throw new Error(
      `Could not find [package] version in ${filePath}`
    );
  }

  if (match[2] === version) {
    return;
  }

  const updated = source.replace(
    packageVersionPattern,
    `$1"${version}"`
  );

  fs.writeFileSync(filePath, updated);
}

function updateTauriVersion(filePath, version) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!json.package || typeof json.package !== "object") {
    throw new Error(
      `Expected a package object in ${filePath}`
    );
  }

  json.package.version = version;

  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

const version = readVersion();

updateJsonVersion(webPackagePath, version);
updateJsonVersion(desktopPackagePath, version);
updateCargoVersion(cargoPath, version);
updateTauriVersion(tauriConfigPath, version);

console.log(`Version synchronized: ${version}`);

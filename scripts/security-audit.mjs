import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(projectRoot);

const token = process.env.AQ_TOKEN;
if (!token) {
  console.error("AQ_TOKEN is unavailable; configure it locally before running the secret-value audit.");
  process.exit(1);
}

const findings = [];
async function scanDirectory(directory, label, ignoredDirectories = new Set()) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await scanDirectory(fullPath, label, ignoredDirectories);
      continue;
    }
    if (!entry.isFile() || (label === "working tree" && entry.name === ".env.local")) continue;
    const content = await readFile(fullPath);
    if (content.includes(Buffer.from(token))) findings.push(`${label}: ${path.relative(projectRoot, fullPath)}`);
  }
}

await scanDirectory(projectRoot, "working tree", new Set([".git", "node_modules", ".next", ".npm-cache", ".vercel"]));
await scanDirectory(path.join(projectRoot, ".next"), ".next build output");

let history;
try {
  history = execFileSync("git", ["log", "--all", "-p", "--format="], {
    cwd: projectRoot,
    encoding: "buffer",
    maxBuffer: 512 * 1024 * 1024,
  });
} catch {
  console.error("Could not read Git history for the credential audit.");
  process.exit(1);
}
if (history.includes(Buffer.from(token))) findings.push("Git history");

const clientFiles = [];
async function collectClientFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectClientFiles(fullPath);
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) {
      const text = await readFile(fullPath, "utf8");
      if (/^\s*["']use client["']/.test(text)) clientFiles.push({ fullPath, text });
    }
  }
}
await collectClientFiles(path.join(projectRoot, "app"));
const clientTokenUsage = clientFiles.filter(({ text }) => /AQ_TOKEN|UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN|SYNC_SECRET/.test(text));
const clientBundleSecretRefs = [];
async function scanClientBundles(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await scanClientBundles(fullPath);
    else if (entry.isFile()) {
      const text = await readFile(fullPath, "utf8");
      if (/AQ_TOKEN|UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN|SYNC_SECRET/.test(text)) clientBundleSecretRefs.push(path.relative(projectRoot, fullPath));
    }
  }
}
await scanClientBundles(path.join(projectRoot, ".next", "static"));
const publicSecretAssignments = [];
const sourcePaths = [];
async function collectSourcePaths(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.join(relative, entry.name);
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (![".git", "node_modules", ".next", ".npm-cache", ".vercel", "data"].includes(entry.name)) await collectSourcePaths(fullPath, relativePath);
    } else if (entry.isFile() && relativePath !== ".env.local") sourcePaths.push(relativePath);
  }
}
await collectSourcePaths(projectRoot);
for (const relativePath of sourcePaths) {
  let text;
  try { text = await readFile(path.join(projectRoot, relativePath), "utf8"); } catch { continue; }
  if (/NEXT_PUBLIC_[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|AUTH|CREDENTIAL)[A-Z0-9_]*/.test(text)) publicSecretAssignments.push(relativePath);
}

const sourceFiles = sourcePaths.filter((file) => /\.(?:mjs|js|ts|tsx)$/.test(file));
const loggedHeaders = [];
for (const relativePath of sourceFiles) {
  let text;
  try { text = await readFile(path.join(projectRoot, relativePath), "utf8"); } catch { continue; }
  for (const line of text.split(/\r?\n/)) {
    if (/console\.(?:log|info|warn|error|debug)/.test(line) && /(?:headers\s*:|authorization\s*:|x-sync-secret\s*:)/i.test(line) && /process\.env|request\.headers/i.test(line)) loggedHeaders.push(relativePath);
  }
}

const healthSource = await readFile(path.join(projectRoot, "app/api/health/route.ts"), "utf8");
const healthExposesToken = /process\.env\.AQ_TOKEN(?!\s*\))/.test(healthSource);
const failures = [
  ...findings,
  ...(token.includes("SYNC_SECRET=") ? ["AQ_TOKEN appears to include another environment variable; check .env.local line breaks"] : []),
  ...(clientTokenUsage.length ? ["server secret variable referenced in client component source"] : []),
  ...(clientBundleSecretRefs.length ? ["server secret variable name found in compiled client assets"] : []),
  ...(publicSecretAssignments.length ? [`NEXT_PUBLIC secret assignment: ${publicSecretAssignments.join(", ")}`] : []),
  ...(loggedHeaders.length ? [`header or credential logged in: ${[...new Set(loggedHeaders)].join(", ")}`] : []),
  ...(healthExposesToken ? ["/api/health appears to expose a raw token"] : []),
];

if (failures.length) {
  console.error("Security audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS token value absent from working files (excluding .env.local), .next output, and Git history");
console.log("PASS no AQ_TOKEN/Upstash/KV tokens or SYNC_SECRET references in client component source or compiled client assets");
console.log("PASS no NEXT_PUBLIC secret assignments found");
console.log("PASS /api/health reports only token presence, not its value");
console.log("PASS no request headers or credential variables are printed by console logging");

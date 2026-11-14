import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(projectRoot);

if (!process.env.SYNC_SECRET) {
  console.error("SYNC_SECRET is not configured in the server environment.");
  process.exit(1);
}

const baseUrl = process.env.SYNC_BASE_URL ?? "http://localhost:3000";
try {
  const response = await fetch(new URL("/api/sync", baseUrl), {
    method: "POST",
    headers: { "x-sync-secret": process.env.SYNC_SECRET, accept: "application/json" },
  });
  const body = await response.json();
  console.log(JSON.stringify(body, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Sync request failed.");
  process.exitCode = 1;
}

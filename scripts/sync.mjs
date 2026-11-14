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

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const syncUrl = new URL("/api/sync", baseUrl);

try {
  while (true) {
    const response = await fetch(syncUrl, {
      method: "POST",
      headers: { "x-sync-secret": process.env.SYNC_SECRET, accept: "application/json" },
    });
    const body = await response.json();

    if (response.status === 429) {
      const retryAfter = Math.max(1, Number(response.headers.get("retry-after") ?? body.retryAfter ?? 61));
      console.log(`Sync is safely checkpointed. Resuming in ${retryAfter} seconds.`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000));
      continue;
    }

    if (!response.ok) {
      console.error(JSON.stringify(body, null, 2));
      process.exitCode = 1;
      break;
    }

    console.log(JSON.stringify(body, null, 2));
    break;
  }
} catch {
  console.error("Sync request failed. Check the URL, network, and deployment logs.");
  process.exitCode = 1;
}

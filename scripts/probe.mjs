import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(projectRoot);

try {
  const { callTool } = await import("../lib/mcp.ts");
  const response = await callTool("get_my_accounts", {});
  const outputPath = path.join(projectRoot, "data", "raw", "get_my_accounts.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  const serialized = JSON.stringify(response.raw, null, 2);
  await writeFile(outputPath, serialized, "utf8");
  console.log("Top-level keys:", Object.keys(response.result && typeof response.result === "object" ? response.result : {}));
  console.log("Preview (1500 chars):", serialized.slice(0, 1500));
} catch (error) {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "Probe failed.");
  process.exitCode = 1;
}

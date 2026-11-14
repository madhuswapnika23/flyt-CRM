import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(projectRoot);

const baseUrl = process.argv[2];
const token = process.env.AQ_TOKEN;
if (!baseUrl) {
  console.error("Usage: npm run smoke -- https://your-deployment.vercel.app");
  process.exit(1);
}
if (!token) {
  console.error("AQ_TOKEN must be set locally so responses can be checked for accidental token disclosure.");
  process.exit(1);
}

const failures = [];
async function check(pathname, expectedStatus, method = "GET", body, recordFailure = true, report = true) {
  const response = await fetch(new URL(pathname, baseUrl), {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  const responseHeaders = [...response.headers.entries()].map(([name, value]) => `${name}: ${value}`).join("\n");
  const leaked = text.includes(token) || responseHeaders.includes(token);
  const passed = response.status === expectedStatus && !leaked;
  if (report) console.log(`${passed ? "PASS" : "FAIL"} ${method} ${pathname} — HTTP ${response.status}${leaked ? " — token found in response" : ""}`);
  if (leaked) failures.push(`${method} ${pathname} response contains AQ_TOKEN`);
  else if (!passed && recordFailure) failures.push(`${method} ${pathname} expected HTTP ${expectedStatus}`);
  return { response, text };
}

async function main() {
  for (const pathname of ["/", "/accounts/A", "/accounts/B", "/actions", "/evidence", "/notes", "/debug"]) {
    await check(pathname, 200);
  }

  await check("/api/health", 200);
  const intelA = await check("/api/intel/A", 200);
  await check("/api/intel/B", 200);
  await check("/api/notes", 200);
  await check("/api/signals/poll", 200);

  let evidenceIds = [];
  try {
    const intel = JSON.parse(intelA.text);
    const visit = (value) => {
      if (Array.isArray(value)) { for (const child of value) visit(child); return; }
      if (typeof value !== "object" || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "sourceId" && typeof child === "string") evidenceIds.push(child);
        if (key === "evidenceIds" && Array.isArray(child)) evidenceIds.push(...child.filter((item) => typeof item === "string"));
        visit(child);
      }
    };
    visit(intel);
    evidenceIds = [...new Set(evidenceIds)];
  } catch { /* The intel request already reports its own failure. */ }

  let evidencePassed = false;
  for (const id of evidenceIds) {
    const result = await check(`/api/evidence/${encodeURIComponent(id)}`, 200, "GET", undefined, false, false);
    if (result.response.status === 200 && !result.text.includes(token)) { evidencePassed = true; break; }
  }
  if (evidencePassed) console.log("PASS GET /api/evidence/[id] — HTTP 200");
  if (!evidencePassed) {
    console.log("FAIL GET /api/evidence/[id] — no valid evidence ID returned by account intelligence");
    failures.push("GET /api/evidence/[id] did not return a stored record");
  }

  // These checks exercise write-route guards without sending a note, acknowledging a signal,
  // or starting an initial sync.
  await check("/api/notes", 400, "POST", {});
  await check("/api/signals/ack", 400, "POST", {});
  await check("/api/sync", 401, "POST", {});

  if (failures.length) {
    console.error(`Smoke test failed for ${failures.length} check(s).`);
    process.exitCode = 1;
  } else {
    console.log("Smoke test passed: pages and read APIs return 200, protected/write routes reject unsafe requests, and no response contains AQ_TOKEN.");
  }
}

main().catch(() => {
  console.error("Smoke test could not reach the deployment. Check the URL and network.");
  process.exitCode = 1;
});

import { afterEach, describe, expect, it } from "vitest";
import { redactSecrets, safeErrorMessage } from "@/lib/security";

const originalEnv = {
  AQ_TOKEN: process.env.AQ_TOKEN,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  SYNC_SECRET: process.env.SYNC_SECRET,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("secret-safe error messages", () => {
  it("redacts configured tokens and bearer headers", () => {
    process.env.AQ_TOKEN = "aq-test-token";
    const message = safeErrorMessage(new Error("Upstream rejected Authorization: Bearer aq-test-token"), "failed");
    expect(message).not.toContain("aq-test-token");
    expect(message).toContain("[redacted]");
  });

  it("redacts secrets embedded in errors from any configured service", () => {
    process.env.UPSTASH_REDIS_REST_TOKEN = "redis-test-token";
    process.env.SYNC_SECRET = "sync-test-secret";
    const message = redactSecrets("redis-test-token / sync-test-secret");
    expect(message).not.toContain("redis-test-token");
    expect(message).not.toContain("sync-test-secret");
  });
});

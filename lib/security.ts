const SECRET_ENV_NAMES = [
  "AQ_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "SYNC_SECRET",
] as const;

export function redactSecrets(message: string): string {
  let safe = message;
  for (const name of SECRET_ENV_NAMES) {
    const secret = process.env[name];
    if (secret) safe = safe.split(secret).join("[redacted]");
  }
  return safe.replace(/(authorization\s*:\s*bearer\s+|bearer\s+)[^\s"'<>]+/gi, "$1[redacted]");
}

export function safeErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return redactSecrets(message || fallback);
}

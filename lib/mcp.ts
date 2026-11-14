import { claimMcpCall } from "@/lib/store";

const MCP_URL = "https://questathon.aihackerscollective.com/api/public/mcp";
const MINIMUM_SPACING_MS = 61_000;

export class McpError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = "McpError";
  }
}

export class McpRateLimitError extends McpError {
  constructor(public readonly lastCallAt: number) {
    super("MCP rate limit: wait at least 61 seconds after the previous call.", "RATE_LIMIT");
    this.name = "McpRateLimitError";
  }
}

export interface McpResponse {
  raw: unknown;
  result: unknown;
}

function parseResponseBody(body: string): unknown {
  const trimmed = body.trim();
  const dataLines = trimmed.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
  const jsonText = dataLines.length ? dataLines.join("\n") : trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new McpError("MCP returned an invalid JSON or SSE response.", "INVALID_RESPONSE");
  }
}

export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<McpResponse> {
  const token = process.env.AQ_TOKEN;
  if (!token) throw new McpError("AQ_TOKEN is not configured on the server.", "MISSING_TOKEN");

  const deniedAt = await claimMcpCall(Date.now(), MINIMUM_SPACING_MS);
  if (deniedAt !== null) throw new McpRateLimitError(deniedAt);

  let response: Response;
  try {
    response = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: `${Date.now()}`, method: "tools/call", params: { name, arguments: args } }),
      cache: "no-store",
    });
  } catch {
    throw new McpError("Could not reach the MCP service.", "NETWORK_ERROR");
  }

  const body = await response.text();
  if (!response.ok) throw new McpError(`MCP request failed with HTTP ${response.status}.`, "HTTP_ERROR", response.status);
  const raw = parseResponseBody(body);
  const envelope = raw as { error?: { message?: string; code?: string | number }; result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> } };
  if (envelope.error) throw new McpError(envelope.error.message ?? "MCP returned a JSON-RPC error.", String(envelope.error.code ?? "RPC_ERROR"));
  const result = envelope.result;
  if (!result) throw new McpError("MCP response did not include a result.", "MISSING_RESULT");
  if (result.isError) throw new McpError(result.content?.[0]?.text ?? "MCP tool reported an error.", "TOOL_ERROR");

  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new McpError("MCP result did not include JSON text content.", "MISSING_CONTENT");
  try {
    return { raw, result: JSON.parse(text) as unknown };
  } catch {
    throw new McpError("MCP tool content was not valid JSON.", "INVALID_TOOL_JSON");
  }
}

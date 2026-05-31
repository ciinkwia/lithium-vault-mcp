#!/usr/bin/env node
// lithium-vault-mcp — entry point.
//
// Wires the MCP stdio transport to the tool catalog (tools.js) through a
// DataSource (datasource.js). Model A uses stdio + X402DataSource; a future
// Model C would swap the transport and/or data source here without touching
// tools.js.

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TOOLS } from "./tools.js";
import { X402DataSource } from "./datasource.js";
import { makePaidFetch } from "./x402.js";

const BASE_URL = process.env.VAULT_BASE_URL || "https://clink-lithium-vault.fly.dev";
const MAX_PRICE = process.env.X402_MAX_PRICE || "0.25";
const ACCOUNT = process.env.CDP_ACCOUNT_NAME || "lithium-vault-mcp";

function requireEnv() {
  const missing = ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    console.error(
      `lithium-vault-mcp: missing required env: ${missing.join(", ")}.\n` +
        `These are your Coinbase CDP wallet credentials — the wallet that pays the per-call USDC fee.\n` +
        `Set them in your MCP client's server config (the "env" block). See .env.example.`
    );
    process.exit(1);
  }
}

async function main() {
  requireEnv();

  const { paidFetch, address } = await makePaidFetch({ accountName: ACCOUNT });
  const maxAtomic =
    MAX_PRICE && Number(MAX_PRICE) > 0
      ? BigInt(Math.round(Number(MAX_PRICE) * 1e6))
      : undefined;
  const dataSource = new X402DataSource({ baseUrl: BASE_URL, paidFetch, maxAtomic });

  const server = new McpServer({ name: "lithium-vault-mcp", version: "0.1.0" });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputShape,
      },
      async ({ entity, level }) => {
        const result = await dataSource.fetchTier(tool.tier, { entity, level });
        if (!result.ok) {
          return { isError: true, content: [{ type: "text", text: result.error }] };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP protocol on stdio transport — log to stderr.
  console.error(
    `lithium-vault-mcp ready — wallet ${address}, base ${BASE_URL}, max $${MAX_PRICE}/call`
  );
}

main().catch((e) => {
  console.error("lithium-vault-mcp fatal:", e);
  process.exit(1);
});

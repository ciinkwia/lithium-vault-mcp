// Smoke test: spawn the MCP server over stdio, list tools, and (if SMOKE_PAY=1)
// make one real paid call to prove the MCP -> x402 -> vault -> data loop.
//
// Requires CDP_API_KEY_ID / CDP_API_KEY_SECRET / CDP_WALLET_SECRET in the env.
// Point CDP_ACCOUNT_NAME at a FUNDED account (e.g. clink-test-buyer) for the
// paid leg, since the default fresh account has no USDC.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PAY = process.env.SMOKE_PAY === "1";

// StdioClientTransport does NOT forward arbitrary env by default — pass it explicitly.
const env = {};
for (const k of [
  "PATH",
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "CDP_WALLET_SECRET",
  "CDP_ACCOUNT_NAME",
  "CDP_NETWORK",
  "VAULT_BASE_URL",
  "X402_MAX_PRICE",
]) {
  if (process.env[k]) env[k] = process.env[k];
}

const transport = new StdioClientTransport({
  command: "node",
  args: ["src/index.js"],
  env,
});

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

console.log("connected.\n");

const { tools } = await client.listTools();
console.log(`TOOLS (${tools.length}):`);
for (const t of tools) {
  const props = Object.keys(t.inputSchema?.properties ?? {}).join(", ");
  console.log(`  - ${t.name}  [in: ${props}]`);
  console.log(`      ${t.description.slice(0, 90)}...`);
}

const names = tools.map((t) => t.name).sort();
const expected = ["lithium_vault_raw", "lithium_vault_story", "lithium_vault_summary"];
const ok = JSON.stringify(names) === JSON.stringify(expected);
console.log(`\nTool catalog ${ok ? "OK" : "*** MISMATCH ***"}`);

if (PAY) {
  console.log("\n--- paid call: lithium_vault_summary { entity: ALB, level: company } ---");
  const res = await client.callTool({
    name: "lithium_vault_summary",
    arguments: { entity: "ALB", level: "company" },
  });
  const text = res.content?.[0]?.text ?? "";
  if (res.isError) {
    console.log("ERROR:", text);
  } else {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    console.log(`SUCCESS — ${text.length} bytes returned.`);
    if (parsed?.meta) console.log("meta:", JSON.stringify(parsed.meta));
    console.log("first 400 chars:", text.slice(0, 400));
  }
} else {
  console.log("\n(skipped paid call — set SMOKE_PAY=1 to exercise the full x402 loop)");
}

await client.close();
process.exit(0);

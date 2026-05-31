# lithium-vault-mcp

MCP server that exposes the Lithium Research Vault's three paid x402 tiers as MCP
tools, so Claude Desktop / Claude Code users can query primary-source lithium
mining data from inside their agent. **Model A (bring-your-own-wallet):** the
server pays the vault's x402 fee from the *caller's* CDP wallet.

Lithium tie-in: this is the MCP distribution channel for the lithium-research
vault (see `../clink-wallet/services/vault/`). Part of the vault's go-to-market
(`../clink-wallet/services/vault/GO_TO_MARKET.md`, item #6).

Scaffolded 2026-05-31. Status: built + end-to-end tested locally against Base
mainnet. NOT yet published to npm / GitHub / MCP registries (held for ciinkwia's
approval).

## Why Model A (and the seam to Model C)

Two models were weighed (see GO_TO_MARKET.md):
- **A — BYOW x402:** caller pays from their own wallet; paywall intact; reaches
  only x402-equipped users. **Chosen** as a cheap experiment with bounded downside.
- **C — hosted freemium:** free summary tier served direct from DuckDB, paid
  depth via x402; huge reach. The fallback if A stalls on adoption.

Decision (2026-05-31): ship A; switch to C if adoption stalls. A's likely failure
mode (wallet friction) is itself the evidence that would justify C.

**The code is structured so A→C is additive, not a rewrite:**
- [`src/tools.js`](./src/tools.js) — tool catalog (names, zod schemas, descriptions,
  `tier`). Transport- and payment-agnostic. **Reused verbatim by C.**
- [`src/datasource.js`](./src/datasource.js) — `DataSource` contract
  (`fetchTier(tier, {entity, level})`). A ships `X402DataSource` (pays the endpoint
  from the caller's wallet, with a pre-flight price-ceiling check). C adds a
  `DirectDataSource` (reads the vault DuckDB free + upsell) implementing the same
  contract.
- [`src/x402.js`](./src/x402.js) — builds the x402-wrapped fetch bound to the
  caller's CDP wallet.
- [`src/index.js`](./src/index.js) — wires the MCP **stdio** transport + the chosen
  data source. C swaps stdio→HTTP and the data source here; tools.js untouched.

## The price-ceiling guard (important)

`wrapFetchWithPayment` in @x402/fetch v2 takes only `(fetch, client)` — it has **no
max-value option** (verified; an earlier `{ maxValue }` arg was silently ignored).
So the ceiling is enforced in `X402DataSource._priceGuard()`: it does an unpaid
GET, reads the price from the `payment-required` header's `accepts[].amount`, and
refuses (no payment) if the cheapest option exceeds `X402_MAX_PRICE`. Degrades to
"allow" if the price can't be read (route prices are server-fixed and low anyway).
Verified 2026-05-31: max $0.01 blocks the $0.02 summary call with no charge.

## Tools

| Tool | tier | path | price |
|------|------|------|-------|
| `lithium_vault_summary` | summary | `/vault/summary` | $0.02 |
| `lithium_vault_raw` | raw | `/vault` | $0.05 |
| `lithium_vault_story` | story | `/vault/story` | $0.20 |

All take `entity` (ticker or mine name) + `level` (`company`|`mine`). Three
separate tools (not one with a `tier` arg) so pricing is transparent and the agent
explicitly opts into the $0.20 story tier.

## Testing

```sh
# Needs CDP creds in the env + a FUNDED account for the paid leg.
set -a; source ../clink-wallet/.env; set +a
export CDP_ACCOUNT_NAME=clink-test-buyer CDP_NETWORK=base

node test/smoke.js              # list tools only (no spend)
SMOKE_PAY=1 node test/smoke.js  # + one real $0.02 paid call (ALB summary)
```

`test/smoke.js` spawns the server over stdio via the MCP client SDK, asserts the
3-tool catalog, and optionally exercises the full pay loop. Use `clink-test-buyer`
(not `clink`) as the payer — `clink` is the vault's payTo, and CDP rejects self-pay.

## Env

See [.env.example](./.env.example). Required: `CDP_API_KEY_ID`,
`CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`. Optional: `CDP_ACCOUNT_NAME`,
`VAULT_BASE_URL`, `X402_MAX_PRICE` (default 0.25).

## Stack

ESM JavaScript, Node ≥20. `@modelcontextprotocol/sdk` (stdio), `@x402/fetch` +
`@x402/evm` + `@coinbase/cdp-sdk` + `viem` (same versions as clink-wallet).

## Not yet done (next steps)

- Publish to npm (`npm publish` — name `lithium-vault-mcp` confirmed free).
- Create GitHub repo `ciinkwia/lithium-vault-mcp`.
- List on MCP registries (mcp.so, Smithery) and add to the awesome-agentic-commerce
  Ecosystem entry ("MCP server available").
- All of the above are outward-facing — get ciinkwia's approval first.

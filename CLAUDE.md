# lithium-vault-mcp

MCP server that exposes the Lithium Research Vault's three paid x402 tiers as MCP
tools, so Claude Desktop / Claude Code users can query primary-source lithium
mining data from inside their agent. **Model A (bring-your-own-wallet):** the
server pays the vault's x402 fee from the *caller's* CDP wallet.

Lithium tie-in: this is the MCP distribution channel for the lithium-research
vault (see `../clink-wallet/services/vault/`). Part of the vault's go-to-market
(`../clink-wallet/services/vault/GO_TO_MARKET.md`, item #6).

Scaffolded + PUBLISHED 2026-05-31.
- **npm:** [`lithium-vault-mcp@0.1.0`](https://www.npmjs.com/package/lithium-vault-mcp)
  (`npx -y lithium-vault-mcp` verified). Published by npm user `baldwijw` (ciinkwia's
  npm account, no 2FA) via a temporary granular **bypass-2FA** token — npm rejects a
  plain token with 403 even on no-2FA accounts. For republishes: `npm login` or a new
  bypass-2FA + read/write-all-packages granular token, then `npm publish --access public`.
- **GitHub:** [ciinkwia/lithium-vault-mcp](https://github.com/ciinkwia/lithium-vault-mcp) (public).
- End-to-end tested against Base mainnet (MCP→x402→vault→data) + price-guard verified.

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
| `lithium_vault_comparables` | comparables | `/vault/comparables` | $0.20 |

All take `entity` (ticker or mine name) + `level` (`company`|`mine`). Three
separate tools (not one with a `tier` arg) so pricing is transparent and the agent
explicitly opts into the $0.20 premium tier.

**2026-06-04 (v0.2.0):** the `$0.20` tier was switched from `lithium_vault_story`
(LLM narrative — a buyer could regenerate it from the $0.05 raw rows) to
`lithium_vault_comparables` (cost-curve percentile + resource & balance-sheet ranking
vs the whole tracked universe — un-reproducible from a single-entity call). The vault's
`/vault/story` endpoint still serves for back-compat but is de-listed from discovery;
this wrapper no longer exposes it.

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

## Done / next steps

- ✅ Published to npm + GitHub (2026-05-31, see status above).
- ◻ Revoke the two temporary publish tokens (`lithium-vault-mcp-pub2`, `-publish`) —
  ciinkwia to do manually; npm's delete uses a native dialog automation can't dismiss.
  They auto-expire 2026-06-06.
- ✅ Published to the **Official MCP Registry** 2026-05-31 as `io.github.ciinkwia/lithium-vault-mcp`
  v0.1.1 (verified active via registry API). Needed npm republish at 0.1.1 with an `mcpName` field
  (registry verifies the published artifact carries it) + a `server.json` (validated by
  `mcp-publisher validate`); GitHub device-flow auth. **PulseMCP auto-ingests from the Official
  Registry** → free downstream listing.
- ✅ Submitted to **mcp.so** 2026-05-31 ("Lithium Vault", id `56f01113-…`); pending maintainer review.
- ✅ **Glama**: auto-indexes public GitHub repos → will appear on its own; manual "Add Server" needs
  a Glama account + CAPTCHA, so skipped.
- ◻ Add "MCP server available" + npm link to the awesome-agentic-commerce Ecosystem
  entry (amend [PR #277](https://github.com/Merit-Systems/awesome-agentic-commerce/pull/277)).
- ◻ Switch to Model C if adoption stalls (the datasource/transport seam makes it additive).
- ◻ Future republishes: `server.json` + `mcpName` must stay version-synced with `package.json`;
  bump all three, `npm publish`, then `mcp-publisher publish`.

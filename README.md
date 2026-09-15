# lithium-vault-mcp

An [MCP](https://modelcontextprotocol.io) server that gives your AI agent **primary-source lithium / battery-metals mining data** — production, AISC, reserves, ownership, royalties, offtakes, and corporate financials for **40 producers and 49 mines**, every figure extracted from SEC / ASX / TSX / SEDAR / cninfo filings and FX-normalized to USD.

Data comes from the **Lithium Research Vault** ([listed on agentic.market](https://agentic.market/services/clink-lithium-vault-fly-dev)). Each tool call is paid per request in USDC over [x402](https://x402.org) **from your own wallet** — no subscription, no API key on our side.

## Tools

| Tool | Price | Returns |
|------|-------|---------|
| `lithium_vault_summary` | $0.02 | One-row headline: latest production, volume-weighted AISC, realized price, cash/debt/EBITDA/FCF, reserves, top holder, source filing |
| `lithium_vault_raw` | $0.05 | Full structured rows: every period of production, AISC, reserves, ownership, royalties, offtakes, financials |
| `lithium_vault_comparables` | $0.20 | Cost-curve percentile + nearest peers, resource-size rank, and balance-sheet survival rank vs the whole tracked universe — every figure cited |
| `lithium_vault_verdict` | $0.05 | A cited, plain-language read: cost-curve position, balance-sheet survival, permitting/dev stage, risks, strengths, and data gaps — facts only, **not investment advice** |
| `lithium_spodumene_history` | $0.05 | Historical SC6 spodumene concentrate benchmark price series (daily/weekly/monthly), market-wide — no entity needed |

`lithium_vault_summary`, `lithium_vault_raw`, `lithium_vault_comparables`, and `lithium_vault_verdict`
each take `entity` (a ticker like `ALB`, `SQM`, `PILBF`, `ATUSF`, or a mine name like `Greenbushes`,
`Pilgangoora`, `Grota do Cirilo`) and `level` (`company` or `mine`). If the entity isn't in the vault
you get a `400` and **no charge**.

`lithium_spodumene_history` takes no entity — it's a single market-wide price series. Optional
inputs: `interval` (`daily` | `weekly` | `monthly`, default `daily`), `from` and `to` (`YYYY-MM-DD`).
Omit all three for the full daily history.

## Prerequisites

A funded **Coinbase CDP wallet** with USDC on Base. You bring your own wallet; the server pays the per-call fee from it (CDP covers gas). Get CDP API credentials at [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com).

## Install & configure

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lithium-vault": {
      "command": "npx",
      "args": ["-y", "lithium-vault-mcp"],
      "env": {
        "CDP_API_KEY_ID": "your-cdp-api-key-id",
        "CDP_API_KEY_SECRET": "your-cdp-api-key-secret",
        "CDP_WALLET_SECRET": "your-cdp-wallet-secret",
        "X402_MAX_PRICE": "0.25"
      }
    }
  }
}
```

### Claude Code

```sh
claude mcp add lithium-vault \
  --env CDP_API_KEY_ID=... \
  --env CDP_API_KEY_SECRET=... \
  --env CDP_WALLET_SECRET=... \
  --env X402_MAX_PRICE=0.25 \
  -- npx -y lithium-vault-mcp
```

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` / `CDP_WALLET_SECRET` | — | **Required.** Your CDP wallet — the wallet that pays. |
| `CDP_ACCOUNT_NAME` | `lithium-vault-mcp` | Named CDP account to pay from (auto-created). |
| `X402_MAX_PRICE` | `0.25` | **Safety ceiling.** The server checks the advertised price *before* paying and refuses any call above this, so a misconfiguration can never overpay. |
| `VAULT_BASE_URL` | `https://clink-lithium-vault.fly.dev` | Override only for testing. |

## How it works

```
your agent → MCP tool call → this server → [x402 402 → pay USDC from your wallet → retry] → vault → data
```

The server reads the endpoint's advertised price first and enforces `X402_MAX_PRICE` before authorizing any payment. You only ever pay the fixed per-tier price ($0.02 / $0.05 / $0.20 — see the tool table above for which tool costs what). The default `X402_MAX_PRICE` of `0.25` already covers every tool, including the $0.20 `lithium_vault_comparables` tier.

## License

MIT

// Tool catalog — transport- and payment-agnostic.
//
// This is the reusable core shared between Model A (x402, bring-your-own-wallet)
// and a future Model C (hosted freemium). Neither transport (stdio vs HTTP) nor
// the data source (pay-the-endpoint vs read-the-DuckDB-directly) appears here.
// `tier` is the only coupling to the vault — the DataSource resolves it to a path.

import { z } from "zod";

// Every entity-scoped tier takes the same two inputs.
const inputShape = {
  entity: z
    .string()
    .min(2)
    .describe(
      "Ticker (for level=company) or mine name (for level=mine). " +
        "Example tickers: ALB, SQM, PILBF, ATUSF, SGML. " +
        "Example mines: Greenbushes, Pilgangoora, Grota do Cirilo, Atacama, Wodgina, Kings Mountain."
    ),
  level: z
    .enum(["company", "mine"])
    .describe(
      "company → operator-level rows for a ticker; " +
        "mine → asset-level rows aggregated across every operator of that mine (e.g. Greenbushes returns IGO + ALB + Tianqi)."
    ),
};

const spodumeneInputShape = {
  interval: z
    .enum(["daily", "weekly", "monthly"])
    .optional()
    .describe("Bucket size for the price series — \"daily\", \"weekly\", or \"monthly\" (default: daily)."),
  from: z.string().min(4).max(10).optional().describe("Start date, YYYY-MM-DD. Omit for the full history."),
  to: z.string().min(4).max(10).optional().describe("End date, YYYY-MM-DD. Omit for up to the latest price."),
};

export const TOOLS = [
  {
    name: "lithium_vault_summary",
    tier: "summary",
    priceUsd: "0.02",
    title: "Lithium vault — headline snapshot ($0.02)",
    description:
      "Headline snapshot for any lithium / battery-metals mining company or producing mine: latest " +
      "production, volume-weighted AISC, realized price, cash/debt/EBITDA/FCF, reserves, top institutional " +
      "holder, and a primary source filing URL. Primary-source data on 40 producers (hardrock spodumene + " +
      "brine) and 49 mines, extracted from SEC/ASX/TSX/SEDAR/cninfo filings and FX-normalized to USD. " +
      "COSTS $0.02 USDC per call, paid from your configured wallet on Base. Cheapest tier — use " +
      "lithium_vault_raw for the full period-by-period history.",
    inputShape,
  },
  {
    name: "lithium_vault_raw",
    tier: "raw",
    priceUsd: "0.05",
    title: "Lithium vault — full structured rows ($0.05)",
    description:
      "Full structured JSON for any lithium / battery-metals producer or mine: every period of production, " +
      "AISC, reserves, ownership history, royalties, offtakes and corporate financials, extracted from " +
      "primary regulator filings (SEC/ASX/TSX/SEDAR/cninfo) and FX-normalized to USD, every figure citable " +
      "to its source document. Mine-level queries return multi-operator rows. " +
      "COSTS $0.05 USDC per call, paid from your configured wallet on Base.",
    inputShape,
  },
  {
    name: "lithium_vault_comparables",
    tier: "comparables",
    priceUsd: "0.20",
    title: "Lithium vault — cost-curve & peer ranking ($0.20)",
    description:
      "Ranks any lithium mining company or mine against the ENTIRE tracked universe: where its AISC sits on " +
      "the global cost curve (percentile), resource-size rank, and balance-sheet net-cash survival rank — " +
      "the analysis that answers 'who survives the downcycle?'. Dataset-level, so it can't be reproduced " +
      "from a single-entity call. Pure deterministic computation (no LLM); every figure cited to a SEC/ASX/TSX filing. " +
      "COSTS $0.20 USDC per call, paid from your configured wallet on Base. For the underlying single-entity " +
      "rows call lithium_vault_raw ($0.05).",
    inputShape,
  },
  {
    name: "lithium_vault_verdict",
    tier: "verdict",
    priceUsd: "0.05",
    title: "Lithium vault — plain-language verdict ($0.05)",
    description:
      "A cited, plain-language read on any lithium / battery-metals mining company or producing mine: " +
      "where it sits on the cost curve, whether the balance sheet can survive a downcycle, its " +
      "permitting/development stage, key risks, key strengths, and where the vault's data has gaps — " +
      "written entirely from primary-source SEC/ASX/TSX filings, facts only. This is NOT investment " +
      "advice and makes no buy/sell/hold call — it is a synthesis of what's on file, not a " +
      "recommendation. COSTS $0.05 USDC per call, paid from your configured wallet on Base. For the " +
      "underlying rows this verdict is built from, use lithium_vault_raw.",
    inputShape,
  },
  {
    name: "lithium_spodumene_history",
    tier: "spodumene_history",
    priceUsd: "0.05",
    title: "Lithium vault — spodumene concentrate price history ($0.05)",
    description:
      "Historical SC6 spodumene concentrate price series (the benchmark hardrock lithium feedstock " +
      "price), bucketed daily, weekly, or monthly, over any date range. Use to chart the cost-curve " +
      "backdrop over time, compare a company's realized price against the benchmark on a given date, " +
      "or check how the market has moved since a filing. No entity/level needed — this is a single " +
      "market-wide series, not per-company. " +
      "COSTS $0.05 USDC per call, paid from your configured wallet on Base.",
    inputShape: spodumeneInputShape,
  },
];

// tier -> vault path. Used by data sources; kept next to the catalog so adding a
// tier means editing one file.
export const TIER_PATHS = {
  summary: "/vault/summary",
  raw: "/vault",
  comparables: "/vault/comparables",
  verdict: "/vault/verdict",
  spodumene_history: "/vault/spodumene-history",
};

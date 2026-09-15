// DataSource abstraction — the seam that keeps a future Model C switch additive.
//
// A DataSource resolves a (tier, {entity, level}) request into a result:
//   { ok: true, data }                      on success
//   { ok: false, error, status, body }      on a handled failure
//
// Model A ships X402DataSource (pays the vault's x402 endpoint from the caller's
// wallet, after a pre-flight price-ceiling check). Model C would add a
// DirectDataSource (reads the vault DuckDB directly for a free summary tier,
// upsells the paid tiers) implementing the same fetchTier() contract — tools.js
// and the MCP wiring would not change.

import { TIER_PATHS } from "./tools.js";

const usd = (atomic) => "$" + (Number(atomic) / 1e6).toFixed(2);

// Pure URL builder, exported for testing without a network/wallet. Every tool
// declares its own zod `inputShape` (tools.js) and index.js passes whatever
// params the caller supplied straight through here — so a tier that doesn't
// take {entity, level} (e.g. lithium_spodumene_history, which takes optional
// interval/from/to) needs no special-casing.
export function buildUrl(baseUrl, path, params = {}) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export class X402DataSource {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl    Vault origin, e.g. https://clink-lithium-vault.fly.dev
   * @param {typeof fetch} opts.paidFetch  x402-wrapped fetch bound to the caller's wallet.
   * @param {bigint} [opts.maxAtomic] Per-call ceiling in atomic USDC units (6 decimals). Omit to disable.
   */
  constructor({ baseUrl, paidFetch, maxAtomic }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.paidFetch = paidFetch;
    this.maxAtomic = maxAtomic;
  }

  // Pre-flight: read the 402's advertised price WITHOUT paying, and refuse if even
  // the cheapest accepted option exceeds the ceiling. Degrades to "allow" if the
  // price can't be read (the route price is server-fixed and low regardless).
  //
  // NOTE: the v2 requirements-selector in x402.js enforces the same ceiling before
  // signing, so there are two layers: this pre-flight gives the clearer error
  // without touching the wallet, the selector is the in-library backstop.
  // Both read v2's atomic `amount` (with legacy field fallbacks).
  async _priceGuard(url) {
    if (this.maxAtomic === undefined) return { blocked: false };
    let accepts;
    try {
      const r = await fetch(url, { method: "GET" }); // unpaid -> 402
      const hdr = r.headers.get("payment-required");
      if (!hdr) return { blocked: false };
      const decoded = JSON.parse(Buffer.from(hdr, "base64").toString("utf8"));
      accepts = decoded.accepts || [];
    } catch {
      return { blocked: false };
    }
    const amounts = accepts
      .map((a) => {
        try {
          return BigInt(a.amount ?? a.maxAmountRequired ?? "0");
        } catch {
          return 0n;
        }
      })
      .filter((x) => x > 0n);
    if (!amounts.length) return { blocked: false };
    const cheapest = amounts.reduce((m, x) => (x < m ? x : m));
    if (cheapest > this.maxAtomic) {
      return {
        blocked: true,
        error:
          `Refused to pay: the endpoint asks at least ${usd(cheapest)} USDC, ` +
          `above your X402_MAX_PRICE of ${usd(this.maxAtomic)}. No charge was made.`,
      };
    }
    return { blocked: false };
  }

  // `params` is whatever the calling tool's inputShape declared — {entity,
  // level} for the per-entity tiers, {interval, from, to} (all optional) for
  // lithium_spodumene_history — passed straight through to the matching
  // endpoint via buildUrl.
  async fetchTier(tier, params = {}) {
    const path = TIER_PATHS[tier];
    if (!path) return { ok: false, error: `Unknown tier "${tier}".`, status: 0 };

    const url = buildUrl(this.baseUrl, path, params);
    const { entity, level } = params;

    const guard = await this._priceGuard(url);
    if (guard.blocked) return { ok: false, status: 0, error: guard.error };

    let res;
    try {
      res = await this.paidFetch(url, { method: "GET" });
    } catch (e) {
      return {
        ok: false,
        status: 0,
        error:
          `Payment was not made: ${e?.message || e}. ` +
          `Check your wallet is funded with USDC on Base.`,
      };
    }

    const ct = res.headers.get("content-type") || "";
    const body = ct.includes("application/json")
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => "");

    if (res.status === 200) return { ok: true, data: body };

    if (res.status === 400) {
      const detail = entity
        ? `"${entity}" was not found in the vault at level=${level}. Check the ticker/mine name, or try the other level.`
        : `${body?.message ?? "check the request parameters"}.`;
      return {
        ok: false,
        status: 400,
        error: `Invalid request (no payment was charged): ${detail}`,
        body,
      };
    }
    if (res.status === 402) {
      return {
        ok: false,
        status: 402,
        error: `Payment did not settle (wallet likely unfunded). No data was returned and no charge was made.`,
        body,
      };
    }
    return {
      ok: false,
      status: res.status,
      error: `Vault returned HTTP ${res.status}.`,
      body,
    };
  }
}

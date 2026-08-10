// x402 payment layer (Model A: bring-your-own-wallet).
//
// Builds an x402-aware fetch bound to the CALLER's Coinbase CDP wallet. Each paid
// request signs an EIP-3009 USDC authorization for the amount the vault's 402
// response demands; CDP's facilitator settles it on Base. The caller pays; CDP
// covers gas.
//
// **Protocol v2 since 0.4.0 (2026-08-10).** The vault server migrated v1 -> v2
// (CAIP-2 network ids like "eip155:8453", atomic `amount`, challenge in the
// PAYMENT-REQUIRED header) because both discovery catalogs now REQUIRE v2:
// x402scan rejects v1 origins outright and the CDP bazaar index dropped us.
// A v1 client CANNOT read a v2 challenge — it throws while parsing `accepts`
// (verified against production 2026-08-10) — so this file moved from
// `x402-fetch@1.2.0` to `@x402/fetch` 2.x + `@x402/evm`.
//
// Requires CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET in the environment.

import { CdpClient } from "@coinbase/cdp-sdk";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { toAccount } from "viem/accounts";

// Base mainnet in CAIP-2 form (v2 spec). Testnet would be eip155:84532.
const NETWORK = process.env.X402_NETWORK || "eip155:8453";

// v2 quotes the price in `amount` (atomic USDC, 6dp). Reading the wrong field
// silently yields 0n and disables the ceiling, so the fallbacks stay explicit.
const atomicOf = (option) => {
  try {
    return BigInt(option.amount ?? option.value ?? option.maxAmountRequired ?? 0);
  } catch {
    return 0n;
  }
};

/**
 * @param {object} opts
 * @param {string} opts.accountName  Named CDP account to pay from (auto-created).
 * @param {bigint} [opts.maxAtomic]  Per-call ceiling in atomic USDC (6 decimals).
 *   Enforced in the requirements selector: if the cheapest option the server
 *   offers exceeds it, we throw BEFORE signing, so no payment is made.
 * @returns {Promise<{ paidFetch: typeof fetch, address: string }>}
 */
export async function makePaidFetch({ accountName, maxAtomic }) {
  const cdp = new CdpClient();
  const account = await cdp.evm.getOrCreateAccount({ name: accountName });

  // The scheme client needs a viem-style account. CDP's EvmServerAccount exposes
  // every signer method; omitting `sign` breaks payload creation.
  const signer = toAccount({
    address: account.address,
    sign: async (parameters) => account.sign(parameters),
    signMessage: async ({ message }) => account.signMessage({ message }),
    signTransaction: async (tx) => account.signTransaction(tx),
    signTypedData: async (td) => account.signTypedData(td),
  });

  const selectCheapest = (_version, accepts) => {
    const sorted = [...accepts].sort((a, b) => Number(atomicOf(a) - atomicOf(b)));
    const pick = sorted[0];
    if (!pick) throw new Error("The endpoint offered no payment options.");
    const amt = atomicOf(pick);
    if (maxAtomic !== undefined && amt > maxAtomic) {
      throw new Error(
        `Refused to pay: the endpoint asks ${Number(amt) / 1e6} USDC, above your ` +
          `X402_MAX_PRICE of ${Number(maxAtomic) / 1e6}. No charge was made.`
      );
    }
    return pick;
  };

  const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: NETWORK, client: new ExactEvmScheme(signer) }],
    paymentRequirementsSelector: selectCheapest,
  });

  return { paidFetch, address: account.address };
}

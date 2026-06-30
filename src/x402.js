// x402 payment layer (Model A: bring-your-own-wallet).
//
// Builds an x402-aware fetch bound to the CALLER's Coinbase CDP wallet. Each paid
// request signs an EIP-3009 USDC authorization for the amount the vault's 402
// response demands; CDP's facilitator settles it on Base. The caller pays; CDP
// covers gas.
//
// Migrated 2026-06-30 to the CDP-compatible x402 1.2.x line. The @x402/* 2.17
// fork emitted a v2 payload missing top-level scheme/network, which CDP's hosted
// facilitator rejected at verify. x402-fetch@1.2.0 emits the
// `{x402Version, scheme, network, payload}` shape CDP accepts.
//
// Requires CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET in the environment.

import { CdpClient } from "@coinbase/cdp-sdk";
import { wrapFetchWithPayment } from "x402-fetch";
import { toAccount } from "viem/accounts";

/**
 * @param {object} opts
 * @param {string} opts.accountName  Named CDP account to pay from (auto-created).
 * @param {bigint} [opts.maxAtomic]  Per-call ceiling in atomic USDC (6 decimals).
 *   Passed to wrapFetchWithPayment as the native maxValue guard. Defense-in-depth
 *   alongside X402DataSource._priceGuard (which refuses BEFORE signing).
 * @returns {Promise<{ paidFetch: typeof fetch, address: string }>}
 */
export async function makePaidFetch({ accountName, maxAtomic }) {
  const cdp = new CdpClient();
  const account = await cdp.evm.getOrCreateAccount({ name: accountName });

  // x402 1.2.x's isAccount() requires ALL of sign/signMessage/signTypedData/
  // signTransaction. CDP's EvmServerAccount exposes every one; omitting `sign`
  // makes createPaymentHeader throw "Invalid evm wallet client provided".
  const signer = toAccount({
    address: account.address,
    sign: async (parameters) => account.sign(parameters),
    signMessage: async ({ message }) => account.signMessage({ message }),
    signTransaction: async (tx) => account.signTransaction(tx),
    signTypedData: async (td) => account.signTypedData(td),
  });

  const paidFetch = wrapFetchWithPayment(fetch, signer, maxAtomic);
  return { paidFetch, address: account.address };
}

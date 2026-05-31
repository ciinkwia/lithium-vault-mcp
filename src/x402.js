// x402 payment layer (Model A: bring-your-own-wallet).
//
// Builds an x402-aware fetch bound to the CALLER's Coinbase CDP wallet. Each paid
// request signs an EIP-3009 USDC authorization for the amount the vault's 402
// response demands; CDP's facilitator settles it on Base. The caller pays; CDP
// covers gas.
//
// Requires CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET in the environment.
//
// Note: the per-call price ceiling is NOT enforced here — wrapFetchWithPayment in
// @x402/fetch v2 takes only (fetch, client). The ceiling is enforced as a
// pre-flight check in datasource.js, which reads the 402's advertised amount
// before authorizing payment.

import { CdpClient } from "@coinbase/cdp-sdk";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toAccount } from "viem/accounts";

/**
 * @param {object} opts
 * @param {string} opts.accountName  Named CDP account to pay from (auto-created).
 * @returns {Promise<{ paidFetch: typeof fetch, address: string }>}
 */
export async function makePaidFetch({ accountName }) {
  const cdp = new CdpClient();
  const account = await cdp.evm.getOrCreateAccount({ name: accountName });

  const signer = toAccount({
    address: account.address,
    signMessage: async ({ message }) => account.signMessage({ message }),
    signTransaction: async (tx) => account.signTransaction(tx),
    signTypedData: async (td) => account.signTypedData(td),
  });

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer));

  const paidFetch = wrapFetchWithPayment(fetch, client);
  return { paidFetch, address: account.address };
}

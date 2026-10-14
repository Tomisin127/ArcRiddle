/**
 * Vercel serverless function — x402 riddle endpoint
 * Uses Circle Facilitator Service for immediate onchain USDC settlement on Arc mainnet.
 *
 * Flow:
 *  1. GET /api/riddle with no payment  → HTTP 402 + payment requirements JSON
 *  2. GET /api/riddle with X-PAYMENT header (buyer's signed EIP-3009 authorization)
 *     → server calls Circle Facilitator /settle → USDC settles onchain → returns riddle
 *
 * Required env vars (set in Vercel project settings):
 *   VITE_SELLER_ADDRESS   - the payTo address (0x72110c7117...)
 *   SELLER_PRIVATE_KEY    - private key of VITE_SELLER_ADDRESS (for seller proof signing)
 *   CIRCLE_API_KEY        - Circle Standard Developer API key
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toBytes, toHex } from "viem";

// ── Constants ────────────────────────────────────────────────────────────────

const FACILITATOR_URL = "https://api.circle.com/v1/facilitator/x402";
// Arc mainnet CAIP-2 identifier
const NETWORK = "eip155:5042";
// Arc mainnet USDC contract
const USDC_CONTRACT = "0x3600000000000000000000000000000000000000" as const;
// 0.001 USDC in 6-decimal units
const AMOUNT = "1000"; // 0.001 USDC (1000 / 1e6)
const MAX_TIMEOUT_SECONDS = 300;

const SELLER_ADDRESS = (process.env.VITE_SELLER_ADDRESS ?? "") as `0x${string}`;
const SELLER_PRIVATE_KEY = (process.env.SELLER_PRIVATE_KEY ?? "") as `0x${string}`;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY ?? "";

// ── Riddle bank ──────────────────────────────────────────────────────────────

const RIDDLES = [
  {
    question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
    answer: "An echo",
    hint: "Think about what bounces back from mountains or empty rooms.",
  },
  {
    question: "The more you take, the more you leave behind. What am I?",
    answer: "Footsteps",
    hint: "Think about what you leave on a snowy path.",
  },
  {
    question: "I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. What am I?",
    answer: "A map",
    hint: "You hold me in your hands to find your way.",
  },
  {
    question: "What has hands but cannot clap?",
    answer: "A clock",
    hint: "You look at me to find out the time.",
  },
  {
    question: "I am always in front of you but cannot be seen. What am I?",
    answer: "The future",
    hint: "It is something that has not happened yet.",
  },
  {
    question: "What can run but never walks, has a mouth but never talks, has a head but never weeps, has a bed but never sleeps?",
    answer: "A river",
    hint: "Think of a flowing body of water.",
  },
  {
    question: "The more you share me, the less you have of me. What am I?",
    answer: "A secret",
    hint: "You whisper me to a friend.",
  },
  {
    question: "I have one eye but cannot see. What am I?",
    answer: "A needle",
    hint: "You use me to sew clothes.",
  },
];

// ── Payment requirements object (advertised in the 402 response) ─────────────

function paymentRequirements() {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: AMOUNT,
    asset: USDC_CONTRACT,
    payTo: SELLER_ADDRESS,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: {
      name: "USDC",
      version: "2",
      assetTransferMethod: "eip3009",
    },
  };
}

// ── Seller proof (EIP-712, signs each Facilitator Service call) ───────────────
// Circle requires a fresh proof per request — purpose must match the route.
// chainId for the domain is Arc mainnet (5042).

async function buildSellerProof(
  purpose: "verify" | "settle" | "status",
  method: string,
  body: string,
): Promise<string> {
  const account = privateKeyToAccount(SELLER_PRIVATE_KEY);
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 300;

  const signature = await account.signTypedData({
    domain: {
      name: "Circle Facilitator Seller Request",
      version: "1",
      chainId: 5042,
    },
    types: {
      SellerRequest: [
        { name: "purpose", type: "string" },
        { name: "method", type: "string" },
        { name: "bodyHash", type: "bytes32" },
        { name: "network", type: "string" },
        { name: "payTo", type: "address" },
        { name: "nonce", type: "bytes32" },
        { name: "issuedAt", type: "uint64" },
        { name: "expiresAt", type: "uint64" },
      ],
    },
    primaryType: "SellerRequest",
    message: {
      purpose,
      method: method.toUpperCase(),
      bodyHash: keccak256(toBytes(body)),
      network: NETWORK,
      payTo: SELLER_ADDRESS,
      nonce: toHex(nonce),
      issuedAt: BigInt(issuedAt),
      expiresAt: BigInt(expiresAt),
    },
  });

  const envelope = {
    version: 1,
    signature,
    network: NETWORK,
    payTo: SELLER_ADDRESS,
    nonce: toHex(nonce),
    issuedAt,
    expiresAt,
  };

  return Buffer.from(JSON.stringify(envelope)).toString("base64url");
}

// ── Parse the X-PAYMENT header (base64url-encoded JSON) ──────────────────────

function parsePaymentHeader(header: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(header) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

// ── Settle via Circle Facilitator Service ────────────────────────────────────

async function settle(paymentPayload: Record<string, unknown>): Promise<{
  success: boolean;
  transaction?: string;
  errorReason?: string;
}> {
  const reqBody = JSON.stringify({
    x402Version: 2,
    paymentPayload,
    paymentRequirements: paymentRequirements(),
  });

  const proof = await buildSellerProof("settle", "POST", reqBody);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Facilitator-Seller-Proof": proof,
  };
  if (CIRCLE_API_KEY) {
    headers["Authorization"] = `Bearer ${CIRCLE_API_KEY}`;
  }

  const resp = await fetch(`${FACILITATOR_URL}/settle`, {
    method: "POST",
    headers,
    body: reqBody,
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[facilitator] settle error", resp.status, text);
    return { success: false, errorReason: `facilitator_error_${resp.status}` };
  }

  const result = await resp.json() as { success: boolean; transaction?: string; errorReason?: string };
  return result;
}

// ── CORS headers ─────────────────────────────────────────────────────────────

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Payment, X-PAYMENT",
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Payment, X-PAYMENT");
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCors(res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Health — unpaid
  const url = req.url ?? "";
  if (url.includes("/api/health") || url === "/health") {
    res.json({ status: "ok", network: "arc-mainnet", price: "0.001 USDC" });
    return;
  }

  // Validate env vars at runtime
  if (!SELLER_ADDRESS || !SELLER_PRIVATE_KEY) {
    res.status(500).json({ error: "Server misconfigured: VITE_SELLER_ADDRESS or SELLER_PRIVATE_KEY missing" });
    return;
  }

  // ── Step 1: No payment header → return 402 ──────────────────────────────
  const paymentHeader = (req.headers["x-payment"] ?? req.headers["X-Payment"] ?? req.headers["X-PAYMENT"] ?? "") as string;

  if (!paymentHeader) {
    const requirements = paymentRequirements();
    // x402 standard 402 response body
    const body = {
      x402Version: 2,
      accepts: [requirements],
      error: "Payment required",
    };
    res.setHeader("Content-Type", "application/json");
    res.status(402).json(body);
    return;
  }

  // ── Step 2: Payment header present → settle ──────────────────────────────
  const paymentPayload = parsePaymentHeader(paymentHeader);
  if (!paymentPayload) {
    res.status(400).json({ error: "Invalid X-Payment header — expected base64url-encoded JSON" });
    return;
  }

  let settlement: { success: boolean; transaction?: string; errorReason?: string };
  try {
    settlement = await settle(paymentPayload);
  } catch (err) {
    console.error("[facilitator] settle threw", err);
    res.status(502).json({ error: "Facilitator Service unreachable" });
    return;
  }

  if (!settlement.success) {
    res.status(402).json({
      x402Version: 2,
      error: settlement.errorReason ?? "settlement_failed",
      accepts: [paymentRequirements()],
    });
    return;
  }

  // ── Step 3: Payment confirmed → return riddle ────────────────────────────
  const riddle = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
  res.setHeader("X-Payment-Transaction", settlement.transaction ?? "");
  res.json({
    question: riddle.question,
    answer: riddle.answer,
    hint: riddle.hint,
    paid: true,
    price_paid: "0.001 USDC",
    transaction: settlement.transaction,
    network: "arc-mainnet",
    seller: SELLER_ADDRESS,
  });
}

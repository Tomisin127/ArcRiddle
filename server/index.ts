/**
 * Express dev server — x402 riddle endpoint
 * Uses Circle Facilitator Service for immediate onchain USDC settlement on Arc mainnet.
 *
 * Required env vars:
 *   VITE_SELLER_ADDRESS   - payTo address
 *   SELLER_PRIVATE_KEY    - private key of VITE_SELLER_ADDRESS
 *   CIRCLE_API_KEY        - Circle Standard Developer API key
 */
import express from "express";
import cors from "cors";
import { join } from "path";
import { existsSync } from "fs";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toBytes, toHex } from "viem";

// ── Constants ────────────────────────────────────────────────────────────────

const FACILITATOR_URL = "https://api.circle.com/v1/facilitator/x402";
const NETWORK = "eip155:5042"; // Arc mainnet
const USDC_CONTRACT = "0x3600000000000000000000000000000000000000" as const;
const AMOUNT = "1000"; // 0.001 USDC (6 decimals)
const MAX_TIMEOUT_SECONDS = 300;

const SELLER_ADDRESS = process.env.VITE_SELLER_ADDRESS as `0x${string}`;
const SELLER_PRIVATE_KEY = process.env.SELLER_PRIVATE_KEY as `0x${string}`;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY ?? "";

if (!SELLER_ADDRESS) throw new Error("VITE_SELLER_ADDRESS env var is required");
if (!SELLER_PRIVATE_KEY) throw new Error("SELLER_PRIVATE_KEY env var is required");

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

// ── Payment requirements ─────────────────────────────────────────────────────

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

// ── Seller proof ─────────────────────────────────────────────────────────────

async function buildSellerProof(
  purpose: "verify" | "settle" | "status",
  method: string,
  body: string,
): Promise<string> {
  const account = privateKeyToAccount(SELLER_PRIVATE_KEY);
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 300;

  const sig = await account.signTypedData({
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
    signature: sig,
    network: NETWORK,
    payTo: SELLER_ADDRESS,
    nonce: toHex(nonce),
    issuedAt,
    expiresAt,
  };

  return Buffer.from(JSON.stringify(envelope)).toString("base64url");
}

// ── Facilitator settle call ──────────────────────────────────────────────────

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

  return resp.json() as Promise<{ success: boolean; transaction?: string; errorReason?: string }>;
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Payment", "X-PAYMENT"],
  exposedHeaders: ["X-Payment", "X-PAYMENT", "X-Payment-Transaction"],
}));

app.use(express.json());

// ── API routes (before static) ───────────────────────────────────────────────

app.get(["/health", "/api/health"], (_req, res) => {
  res.json({ status: "ok", network: "arc-mainnet", price: "0.001 USDC" });
});

async function riddleHandler(req: express.Request, res: express.Response): Promise<void> {
  const paymentHeader = (
    req.headers["x-payment"] ?? req.headers["X-Payment"] ?? req.headers["X-PAYMENT"] ?? ""
  ) as string;

  // No payment — return 402
  if (!paymentHeader) {
    res.status(402).json({
      x402Version: 2,
      accepts: [paymentRequirements()],
      error: "Payment required",
    });
    return;
  }

  // Parse the payment payload from the header
  let paymentPayload: Record<string, unknown>;
  try {
    paymentPayload = JSON.parse(
      Buffer.from(paymentHeader, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    try {
      paymentPayload = JSON.parse(paymentHeader) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: "Invalid X-Payment header" });
      return;
    }
  }

  // Settle via Circle Facilitator Service
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

  // Payment confirmed — serve the riddle
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

app.get(["/riddle", "/api/riddle"], riddleHandler);

// ── Static frontend (production, after API routes) ────────────────────────────

const distPath = join(import.meta.dir, "../dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((_req: express.Request, res: express.Response) => {
    res.sendFile(join(distPath, "index.html"));
  });
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
  console.log(`[server] seller: ${SELLER_ADDRESS}`);
  console.log(`[server] network: Arc mainnet (${NETWORK})`);
  console.log(`[server] facilitator: ${FACILITATOR_URL}`);
});

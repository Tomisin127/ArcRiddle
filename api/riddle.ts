// Vercel serverless function — replaces the Express server for Vercel deployments.
// Vercel auto-discovers this file at GET/POST /api/riddle.
// The @circle-fin/x402-batching gateway middleware works identically here.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";

const FACILITATOR_URL = "https://gateway-api.circle.com";
const SELLER_ADDRESS = process.env.VITE_SELLER_ADDRESS as `0x${string}`;
const PRICE = "$0.001";

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

// createGatewayMiddleware returns an Express-compatible middleware pair.
// For Vercel we wrap it manually: call gateway.require() to get the middleware,
// then invoke it against a minimal Express-like req/res shim.
// Simpler: use the BatchFacilitatorClient directly via the middleware's internal
// verify step — but the easiest correct approach is to use express on Vercel
// via a micro-adapter, which Vercel supports natively.

import express from "express";
import cors from "cors";

// Build a tiny Express app once (module-level, reused across warm invocations).
const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Payment", "Payment-Required"],
  exposedHeaders: ["X-Payment", "Payment-Required", "PAYMENT-REQUIRED"],
}));
app.use(express.json());

if (!SELLER_ADDRESS) {
  console.error("VITE_SELLER_ADDRESS env var is not set");
}

const gateway = createGatewayMiddleware({
  sellerAddress: SELLER_ADDRESS || "0x0000000000000000000000000000000000000000",
  facilitatorUrl: FACILITATOR_URL,
});

function riddleHandler(_req: express.Request, res: express.Response) {
  const riddle = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
  res.json({
    question: riddle.question,
    answer: riddle.answer,
    hint: riddle.hint,
    paid: true,
    price_paid: PRICE,
    seller: SELLER_ADDRESS,
    network: "arc-mainnet",
  });
}

app.get("/api/riddle", gateway.require(PRICE), riddleHandler);
app.get("/riddle",     gateway.require(PRICE), riddleHandler);
app.get("/api/health", (_req, res) => res.json({ status: "ok", price: PRICE }));

// Vercel passes (req, res) — delegate straight to the Express app.
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel already parsed the URL; Express needs the full path on req.url.
  // Rewrite /api/riddle → /api/riddle (already correct) or /riddle → /riddle.
  return app(req as unknown as express.Request, res as unknown as express.Response);
}

// Vercel serverless function — x402 riddle endpoint.
// Vercel routes /api/riddle and /api/health to this file via vercel.json.
// The Express app is built once at module level and reused across warm invocations.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import cors from "cors";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";

const FACILITATOR_URL = "https://gateway-api.circle.com";
const SELLER_ADDRESS = (process.env.VITE_SELLER_ADDRESS ?? "") as `0x${string}`;
const PRICE = "$0.001";

if (!SELLER_ADDRESS) {
  console.error("[riddle] VITE_SELLER_ADDRESS env var is not set");
}

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

// Build Express app once — warm Lambda invocations reuse this instance.
const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Payment", "Payment-Required", "X-PAYMENT"],
  exposedHeaders: ["X-Payment", "Payment-Required", "PAYMENT-REQUIRED"],
}));
app.use(express.json());

const gateway = createGatewayMiddleware({
  sellerAddress: SELLER_ADDRESS,
  facilitatorUrl: FACILITATOR_URL,
});

function riddleHandler(_req: express.Request, res: express.Response): void {
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

// Health — unpaid
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", network: "arc-mainnet", price: PRICE });
});

// Riddle — requires x402 payment
app.get("/api/riddle", gateway.require(PRICE), riddleHandler);

// Vercel handler: patch req.url so Express matches the /api/* routes above,
// then delegate to the Express app.
export default function handler(req: VercelRequest, res: VercelResponse): void {
  // Vercel strips the path prefix before calling the function on some runtimes;
  // ensure the full path is present so our route patterns match.
  if (req.url && !req.url.startsWith("/api/")) {
    req.url = "/api/riddle";
  }
  app(req as unknown as express.Request, res as unknown as express.Response);
}

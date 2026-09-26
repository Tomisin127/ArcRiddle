import express from "express";
import cors from "cors";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { join } from "path";
import { existsSync } from "fs";

// Arc mainnet Gateway facilitator URL
const FACILITATOR_URL = "https://gateway-api.circle.com";

const SELLER_ADDRESS =
  (process.env.VITE_SELLER_ADDRESS as `0x${string}`);

if (!SELLER_ADDRESS) {
  throw new Error("VITE_SELLER_ADDRESS env var is required");
}

const PRICE = "$0.001";

const RIDDLES = [
  {
    question:
      "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
    answer: "An echo",
    hint: "Think about what bounces back from mountains or empty rooms.",
  },
  {
    question:
      "The more you take, the more you leave behind. What am I?",
    answer: "Footsteps",
    hint: "Think about what you leave on a snowy path.",
  },
  {
    question:
      "I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. What am I?",
    answer: "A map",
    hint: "You hold me in your hands to find your way.",
  },
  {
    question:
      "What has hands but cannot clap?",
    answer: "A clock",
    hint: "You look at me to find out the time.",
  },
  {
    question:
      "I am always in front of you but cannot be seen. What am I?",
    answer: "The future",
    hint: "It is something that has not happened yet.",
  },
  {
    question:
      "What can run but never walks, has a mouth but never talks, has a head but never weeps, has a bed but never sleeps?",
    answer: "A river",
    hint: "Think of a flowing body of water.",
  },
  {
    question:
      "The more you share me, the less you have of me. What am I?",
    answer: "A secret",
    hint: "You whisper me to a friend.",
  },
  {
    question:
      "I have one eye but cannot see. What am I?",
    answer: "A needle",
    hint: "You use me to sew clothes.",
  },
];

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Payment", "Payment-Required"],
    exposedHeaders: ["X-Payment", "Payment-Required", "PAYMENT-REQUIRED"],
  })
);

app.use(express.json());

const gateway = createGatewayMiddleware({
  sellerAddress: SELLER_ADDRESS,
  facilitatorUrl: FACILITATOR_URL,
});

// Health check — unpaid
app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: "arc-mainnet", price: PRICE });
});

// Riddle endpoint — requires 0.001 USDC paid via x402 Gateway
app.get("/riddle", gateway.require(PRICE), (_req, res) => {
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
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`x402 riddle server listening on port ${PORT}`);
  console.log(`Seller address: ${SELLER_ADDRESS}`);
  console.log(`Riddle price: ${PRICE}`);
  console.log(`Facilitator: ${FACILITATOR_URL}`);
});

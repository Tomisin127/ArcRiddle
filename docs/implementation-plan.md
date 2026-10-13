The core issue is that `createGatewayMiddleware` without a network filter advertises every chain it supports. Your CLI wallet paid on whichever chain it had funds on — almost certainly not Arc mainnet. The fix is to lock the middleware to Arc mainnet (`eip155:5042`) only, in both the server and the Vercel function. I need to check what network-filtering options `createGatewayMiddleware` actually accepts in v3.5.0: Found it. Line 263: `networks?: string | string[]` — CAIP-2 format. Arc mainnet is `eip155:5042`. Now fix both files:I'm in Plan mode — switch to **Build mode** using the mode selector and I'll apply both changes immediately.

Here is exactly what needs to change in both files (one line each):

**`server/index.ts`** — add `networks: "eip155:5042"` to `createGatewayMiddleware`:
```ts
const gateway = createGatewayMiddleware({
  sellerAddress: SELLER_ADDRESS,
  facilitatorUrl: FACILITATOR_URL,
  networks: "eip155:5042",  // Arc mainnet only
});
```

**`api/riddle.ts`** — same change:
```ts
const gateway = createGatewayMiddleware({
  sellerAddress: SELLER_ADDRESS,
  facilitatorUrl: FACILITATOR_URL,
  networks: "eip155:5042",  // Arc mainnet only
});
```

Once I'm in Build mode I'll make both edits, run the check, and commit. Switch over and I'll do it.

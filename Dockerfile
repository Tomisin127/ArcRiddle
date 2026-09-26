# syntax=docker/dockerfile:1
FROM oven/bun:1 AS base
WORKDIR /app

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Build frontend ────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
ARG VITE_SELLER_ADDRESS
ENV VITE_SELLER_ADDRESS=${VITE_SELLER_ADDRESS}
RUN bun run build 2>/dev/null || bunx vite build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS runtime
WORKDIR /app

# Copy only what the server needs at runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY package.json ./

# Serve the built frontend as static files from the Express server
RUN bun add serve-static

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["bun", "run", "server/index.ts"]

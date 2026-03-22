FROM node:20-alpine AS base

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package*.json ./
# Skip Playwright browser download — we use the system Chromium in the runner
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci

# ── Stage 2: build the Next.js app ────────────────────────────────────────────
FROM base AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client with the correct OpenSSL 3.x binary for Alpine
RUN PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: production runner ───────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# openssl is required by the Prisma query engine (linux-musl-openssl-3.0.x binary)
# System Chromium for the Bezel scraper fallback (Alpine-native, no apt-get needed)
RUN apk add --no-cache openssl chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont

# Tell Playwright to use the system Chromium instead of its bundled binary
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Force Prisma to load the linux-musl-openssl-3.0.x engine, bypassing
# auto-detection which incorrectly selects linux-musl on some Alpine builds.
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir -p ./public
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]

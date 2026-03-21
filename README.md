# Bezel-Kalshi Dashboard

A production-quality Next.js 15 dashboard for tracking and modeling Kalshi watch markets that resolve using Bezel watch price data. Combines real-time market data, historical storage, volatility modeling, probability estimation, and correlation analysis.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Local Setup](#local-setup)
5. [Environment Variables](#environment-variables)
6. [Database Setup](#database-setup)
7. [Running the App](#running-the-app)
8. [Scheduled Jobs](#scheduled-jobs)
9. [Bezel Scraping Layer](#bezel-scraping-layer)
10. [Probability Engine](#probability-engine)
11. [Production Deployment](#production-deployment)
12. [Extending the App](#extending-the-app)
13. [Assumptions and Fragile Parts](#assumptions-and-fragile-parts)
14. [Troubleshooting](#troubleshooting)

---

## Overview

This dashboard helps you:
- **Monitor** Kalshi watch market prices (YES/NO, orderbook, volume)
- **Track** Bezel watch index and model prices over time
- **Model** the probability that a Bezel series finishes above/below a Kalshi strike by expiration
- **Analyze** correlations between watch indexes, models, and Kalshi implied probabilities
- **Research** which Bezel series best predicts each Kalshi contract

### Supported Markets (initial seed)

| Kalshi Market | Ticker | Bezel Entity |
|---|---|---|
| Cartier Watch Index March 2026 | KXCARTIER-MAR | Cartier Index |
| Rolex Index March 2026 | KXROLEX-MAR | Rolex Index |
| Rolex Submariner Date 41 Starbucks March 2026 | KXBEZELRSUB41LV-MAR | Rolex Sub 41 LV (126610LV) |

---

## Architecture

```
src/
├── app/                          # Next.js 15 App Router
│   ├── dashboard/                # Main dashboard page
│   ├── markets/[ticker]/         # Market detail page (6 tabs)
│   ├── research/correlations/    # Correlation research page
│   └── api/                      # API routes
│       ├── dashboard/            # Aggregate dashboard data
│       ├── kalshi/               # Kalshi market data
│       ├── bezel/                # Bezel entity data
│       ├── model/                # Probability model
│       ├── correlations/         # Correlation metrics
│       ├── ingestion-logs/       # Audit logs
│       └── jobs/                 # Cron job triggers
├── components/
│   ├── dashboard/                # MarketCard, MarketGrid, StatsBar
│   ├── market/                   # OrderbookLadder, BezelHistoryChart, ProbabilityPanel
│   ├── research/                 # CorrelationHeatmap, RollingCorrelationChart
│   └── shared/                   # Sparkline, SourceBadge, StaleDataWarning
├── lib/
│   ├── kalshi/                   # Kalshi REST API client + normalizer
│   ├── bezel/                    # BezelProvider (4-tier scraping)
│   ├── db/                       # Prisma singleton + typed queries
│   ├── math/                     # Volatility, Probability, MonteCarlo, Correlation
│   ├── mappings/                 # Kalshi ↔ Bezel static config
│   ├── jobs/                     # Refresh + compute scheduled jobs
│   └── utils/                    # Retry, logger, formatters
├── hooks/                        # TanStack Query hooks
└── types/                        # Global TypeScript types

prisma/
├── schema.prisma                 # Database schema
└── seed.ts                       # Seed script
```

### Data Flow

```
[Cron: every 15min]  Kalshi REST API → normalize → upsert market → append snapshots
[Cron: every 60min]  Bezel pages → 4-tier scrape → normalize → append price snapshots
[Cron: every 60min]  DB history → compute returns/vol → run probability models → store
[Cron: every 6h]     DB history → compute pairwise correlations → store
[UI: React Query]    /api/dashboard → MarketGrid → MarketCards (auto-refresh 60s)
```

---

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 15+
- **Playwright Chromium** (for Bezel scraping fallback)

---

## Local Setup

### 1. Install dependencies

```bash
cd "C:\Users\betti\OneDrive\Desktop\SSC\Bezel_Watches"
npm install
```

### 2. Install Playwright browser

```bash
npm run playwright:install
# or: npx playwright install chromium
```

### 3. Configure environment

```bash
copy .env.example .env
# Edit .env with your values
```

### 4. Start PostgreSQL

**Docker (recommended):**
```bash
docker compose up -d postgres
```

**Local PostgreSQL:**
```sql
CREATE USER bezel_user WITH PASSWORD 'bezel_password';
CREATE DATABASE bezel_kalshi OWNER bezel_user;
```

Set `DATABASE_URL=postgresql://bezel_user:bezel_password@localhost:5432/bezel_kalshi` in `.env`.

### 5. Set up database

```bash
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema to DB
npm run db:seed        # Seed initial market mappings
```

### 6. Fetch initial data

```bash
npm run jobs:all       # Fetches Kalshi + Bezel, computes probabilities + correlations
```

### 7. Start the dev server

```bash
npm run dev
# Open http://localhost:3000
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `KALSHI_BASE_URL` | ✅ | `https://api.elections.kalshi.com/trade-api/v2` |
| `KALSHI_API_KEY` | ❌ | Optional Kalshi API key |
| `BEZEL_BASE_URL` | ✅ | `https://markets.getbezel.com` |
| `CRON_SECRET` | ✅ | Secret for cron job API routes |
| `NEXT_PUBLIC_APP_URL` | ✅ | App URL (e.g. `http://localhost:3000`) |
| `LOG_LEVEL` | ❌ | `info` (or `debug`, `warn`, `error`) |
| `PLAYWRIGHT_HEADLESS` | ❌ | `true` (set `false` to debug scraper) |

---

## Database Setup

### Useful commands

```bash
npm run db:studio     # Open Prisma Studio visual browser at localhost:5555
npm run db:migrate    # Create and apply migration files (production)
```

### Schema overview

| Table | Purpose |
|---|---|
| `KalshiMarket` | Market metadata |
| `KalshiMarketSnapshot` | Append-only price/volume snapshots |
| `KalshiOrderbookSnapshot` | Full orderbook ladders |
| `BezelEntity` | Index or model entity |
| `BezelPriceSnapshot` | Bezel price history |
| `MarketMapping` | Kalshi ticker ↔ Bezel entity links |
| `ProbabilityRun` | Model outputs per run |
| `CorrelationMetric` | Pairwise correlations |
| `IngestionLog` | Full audit log |

---

## Running the App

```bash
npm run dev       # Development
npm run build     # Production build
npm run start     # Start production server
```

---

## Scheduled Jobs

### Manual execution

```bash
npm run jobs:kalshi           # Refresh Kalshi market data
npm run jobs:bezel            # Refresh Bezel price data
npm run jobs:probabilities    # Compute probability models
npm run jobs:correlations     # Compute correlations
npm run jobs:all              # Run all in sequence
```

### System cron (Linux/Mac)

```cron
*/15 * * * * cd /path/to/project && npm run jobs:kalshi >> /var/log/bezel-kalshi.log 2>&1
0 * * * *    cd /path/to/project && npm run jobs:bezel && npm run jobs:probabilities >> /var/log/bezel-kalshi.log 2>&1
0 */6 * * *  cd /path/to/project && npm run jobs:correlations >> /var/log/bezel-kalshi.log 2>&1
```

### Vercel Cron Jobs

`vercel.json` is pre-configured. Set `CRON_SECRET` in your Vercel project env vars.

### API triggers (dashboard "Refresh Now" button)

- `POST /api/jobs/refresh-kalshi`
- `POST /api/jobs/refresh-bezel`
- `POST /api/jobs/compute-probabilities`
- `POST /api/jobs/compute-correlations`

All require `Authorization: Bearer {CRON_SECRET}` header.

---

## Bezel Scraping Layer

Bezel (`markets.getbezel.com`) has no documented public API. The `BezelProvider` implements a **4-tier fallback strategy**:

| Tier | Method | Quality Flag |
|---|---|---|
| 1 | Cached/discovered API endpoint → direct fetch | `frontend_network_capture` |
| 2 | Playwright XHR discovery → fetch discovered URL | `frontend_network_capture` |
| 3 | Playwright DOM scrape (rendered page) | `html_scrape` |
| 4 | Manual fallback — null price, stale warning shown | `manual_mapping_fallback` |

### Updating scraper selectors when Bezel changes its frontend

Edit `SCRAPER_SELECTORS` in `src/lib/bezel/scrapers.ts`. To inspect selectors:

1. Open Chrome DevTools → Network tab → filter XHR/Fetch
2. Navigate to `https://markets.getbezel.com/indexes`
3. Find JSON responses with price/index data
4. Copy the request URL and update `BezelDiscoveredEndpoint` accordingly

Set `PLAYWRIGHT_HEADLESS=false` in `.env` to watch the browser during scraping.

---

## Probability Engine

### Models

| Model | Description |
|---|---|
| `normal` | Log-normal GBM with realized vol. Default. |
| `empirical` | Historical overlapping T-day return distribution. |
| `monte_carlo` | GBM Monte Carlo (10,000 paths). |
| `ornstein_uhlenbeck` | Mean-reverting OU process. |

### Key outputs

- **`probabilityAbove`** / **`probabilityBelow`** — model-implied probability
- **`kalshiImpliedProb`** — from Kalshi YES price ÷ 100
- **`modelEdge`** — your edge: `modelProb - kalshiImpliedProb`
- **`confidenceScore`** — [0, 1] based on data sample size
- **`scenarioTable`** — sensitivity across 7 vol assumptions (2%–30%)
- **`percentileBands`** — P5, P10, P25, P50, P75, P90, P95 at expiry

### Volatility windows

5d, 10d, 20d (default), 30d, 60d lookbacks. Select in UI on market detail page.

---

## Production Deployment

### Vercel

```bash
npm i -g vercel
vercel --prod
```

Required env vars: `DATABASE_URL`, `KALSHI_BASE_URL`, `BEZEL_BASE_URL`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.

**Note on Playwright in Vercel**: Serverless functions don't include Chromium. Options:
- Use `@sparticuz/chromium` package (Vercel Pro/Enterprise)
- Run scraping jobs on Railway/Render and call via webhook
- Use `npm run jobs:bezel` on a dedicated machine on a cron schedule

### Docker

```bash
docker compose up --build
```

### GitHub → Vercel CI/CD

1. Create GitHub repo and push code
2. Import project in Vercel dashboard → connect GitHub repo
3. Set env vars in Vercel dashboard
4. Every push to `main` auto-deploys

---

## Extending the App

### Add a new Kalshi market

1. Add entry to `MARKET_MAPPINGS` in `src/lib/mappings/index.ts`
2. Run `npm run db:seed`
3. Run `npm run jobs:all`

### Add a new probability model

1. Implement in `src/lib/math/probability.ts`
2. Add to `ProbabilityModelType` in `src/types/index.ts`
3. Add case to `computeProbability()` dispatcher
4. Add UI option in the market detail page model selector

---

## Assumptions and Fragile Parts

### Kalshi

- **API base URL**: `https://api.elections.kalshi.com/trade-api/v2` — if Kalshi changes this, update `KALSHI_BASE_URL` in `.env`
- **Strike parsing**: Regex-based from title/rules text in `src/lib/kalshi/normalizer.ts::parseStrikeFromTitle()`. Will fail on non-standard title formats.
- **Authentication**: Some endpoints may require `KALSHI_API_KEY`. Add to `.env` if you hit 401 errors.

### Bezel (most fragile)

- **No public API**: All price data relies on scraping discovered internal endpoints or DOM extraction.
- **Selector drift**: When Bezel updates their React frontend, `SCRAPER_SELECTORS` in `scrapers.ts` will break. Monitor `IngestionLog` table for `html_scrape` failures.
- **JavaScript required**: Bezel is a React SPA — plain `fetch()` returns an empty shell. Playwright renders it fully.
- **Name matching**: Fuzzy slug→entity name matching. If Bezel renames an index, update `bezelSlug` in `src/lib/mappings/index.ts`.

### Probability models

- **Watch prices ≠ equities**: Log-normal GBM is an approximation for an illiquid, infrequently-traded asset. Treat outputs as directional signals.
- **Short history**: Early runs with <10 data points will skip probability computation. Accuracy improves over time as history accumulates.
- **No mean drift adjustment**: With short lookback windows, drift estimates are noisy. The model defaults to zero drift if the t-statistic is not significant.

### Database

- **Append-only snapshots**: Never automatically deleted. Periodically run:
  ```sql
  DELETE FROM "BezelPriceSnapshot" WHERE "capturedAt" < NOW() - INTERVAL '1 year';
  ```
- **Duplicate snapshots**: If a job runs twice rapidly, two snapshots are created. Queries always use `ORDER BY capturedAt DESC LIMIT 1` for latest value.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `Cannot connect to database` | Check `DATABASE_URL` in `.env`, verify PostgreSQL is running |
| `Playwright browser not found` | Run `npm run playwright:install` |
| Bezel prices always null | Set `PLAYWRIGHT_HEADLESS=false`, inspect browser; update selectors |
| Kalshi returns 401 | Add `KALSHI_API_KEY` to `.env` |
| `Insufficient data` for probability | Run `npm run jobs:bezel` over several days to accumulate history |
| Module not found errors | Run `npm run db:generate`, then `npm install` |

---

*Private research tool — not for redistribution.*

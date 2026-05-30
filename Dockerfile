## Multi-stage Dockerfile
## Stage 1 (web): Slim Node.js image for the Next.js web service (~300MB vs ~1.5GB)
## Stage 2 (scraper): Full Playwright image for headless browser cron services

# ── Stage 1: Web service (no browser binaries needed) ──────────────────────────
FROM node:20-slim AS web

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy the rest of the application
COPY . .

# Generate drizzle client and build Next.js
RUN npm run build

# Default command for the web service
CMD ["npm", "run", "start"]


# ── Stage 2: Scraper service (Playwright + browser binaries) ───────────────────
FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS scraper

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev deps for ts-node/tsx)
RUN npm ci

# Copy the rest of the application
COPY . .

# No build needed for cron scripts — they run via ts-node
# Default command is overridden per cron service in Railway/docker-compose
CMD ["echo", "Specify a command for this scraper container"]

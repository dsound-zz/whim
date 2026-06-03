## Multi-stage Dockerfile
## Stage 1 (web): Slim Node.js image for the Next.js web service (~300MB vs ~1.5GB)
## Stage 2 (scraper): Full Playwright image for headless browser cron services

# ── Stage 1: Web service (no browser binaries needed) ──────────────────────────
FROM node:20-slim AS web

# NEXT_PUBLIC_* vars are inlined at build time by Next.js — they must be
# declared as Docker ARGs so Railway's build-time env vars are visible here.
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN

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

# Same ARG/ENV pattern — Railway uses this stage as the default build target,
# so the Next.js bundle compiled here also needs the token baked in.
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev deps for ts-node/tsx)
RUN npm ci

# Copy the rest of the application
COPY . .

# Build Next.js so the .next production directory exists when `next start` is invoked
# (Railway uses this stage as the default build target)
RUN npm run build

# Default command is overridden per cron service in Railway/docker-compose
CMD ["echo", "Specify a command for this scraper container"]

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // node-ical uses BigInt which Turbopack can't bundle — keep it as a native require.
  // Playwright + its stealth plugin are excluded defensively: if any future App Router
  // route statically imports a Playwright-based scraper, tracing that huge dependency
  // graph (multiple browser drivers, native binaries) on every dev compile is a known
  // cause of extremely slow/memory-heavy builds. Scrapers should only ever be invoked
  // from standalone scripts (scripts/*.ts run by Railway cron), never from app routes.
  serverExternalPackages: ["node-ical", "playwright", "playwright-extra", "puppeteer-extra-plugin-stealth"],
};

export default nextConfig;

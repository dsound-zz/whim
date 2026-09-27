import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stray lockfiles in parent directories (~/package-lock.json) make Next infer the
  // home directory as the workspace root, so Turbopack watches all of ~ and panics
  // with "Too many open files". Pin the root to this project.
  turbopack: {
    root: __dirname,
  },
  // The primary dev machine has 8 GB RAM; uncapped, the first compile exhausted memory
  // and hard-froze the OS. Cap Turbopack's heap target and the worker pool size.
  experimental: {
    turbopackMemoryLimit: 1.5 * 1024 * 1024 * 1024,
    cpus: 2,
    // Persisting the dev cache spent minutes on disk writes under memory pressure, and
    // hard reboots mid-write left a 430 MB cache behind. Recompiling on restart is cheaper here.
    turbopackFileSystemCacheForDev: false,
  },
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

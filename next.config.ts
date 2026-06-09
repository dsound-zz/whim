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
  // node-ical uses BigInt which Turbopack can't bundle — keep it as a native require
  serverExternalPackages: ["node-ical"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Development only: keep Next's indicator clear of the till's Lock button (bottom left).
  devIndicators: { position: "bottom-right" },
  // Native modules: load them from node_modules at runtime instead of bundling.
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The till must never be shown inside another site's frame (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

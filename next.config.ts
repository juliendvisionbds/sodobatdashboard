import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    serverActions: {
      // Les balances analytiques Cegid dépassent 1 Mo (ex. mai 2026 : 3,1 Mo).
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;

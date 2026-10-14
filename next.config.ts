import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Anciennes adresses : les deux documents étaient des fichiers statiques de
  // public/docs, l'écran Rapprochement a été retiré le 14 octobre 2026.
  async redirects() {
    return [
      { source: "/docs/guide-utilisateur.html", destination: "/guide", permanent: true },
      { source: "/docs/documentation.html", destination: "/documentation", permanent: true },
      { source: "/rapprochement", destination: "/", permanent: true },
    ];
  },
  experimental: {
    serverActions: {
      // Les balances analytiques Cegid dépassent 1 Mo (ex. mai 2026 : 3,1 Mo).
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;

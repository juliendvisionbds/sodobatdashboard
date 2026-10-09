import type { Metadata } from "next";
import "./globals.css";

// Geist (interface, chiffres) et Geist Mono (numéros de compte, codes) sont
// chargées par feuille de style, pas par next/font : le build Vercel n'a plus à
// télécharger les fichiers de police (échec du 25 septembre 2026, résolution
// Turbopack de next/font/google).
const FONTS =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap";

export const metadata: Metadata = {
  title: "Tableaux de gestion | Groupe SDG",
  description: "Tableaux de gestion intelligents du Groupe SDG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

// La police Inter est chargée par feuille de style, pas par next/font : le
// build Vercel n'a plus à télécharger les fichiers de police (échec du 25
// septembre 2026, résolution Turbopack de next/font/google).
const INTER =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap";

export const metadata: Metadata = {
  title: "Sodobat | Tableaux de gestion | Groupe SDG",
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
        <link rel="stylesheet" href={INTER} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Onglets de la barre de navigation, partagés entre l'en-tête et l'écran
// d'attente affiché pendant le chargement d'une vue.
export type NavTabKey = "synthese" | "chantiers" | "fx" | "objectifs" | "assistant";

export const NAV_TABS: { key: NavTabKey; label: string; href: string }[] = [
  { key: "synthese", label: "Synthèse", href: "/" },
  { key: "chantiers", label: "Chantiers", href: "/chantiers" },
  { key: "fx", label: "Frais généraux", href: "/frais-generaux" },
  { key: "objectifs", label: "Objectifs", href: "/objectifs" },
  { key: "assistant", label: "Assistant IA", href: "/assistant" },
];

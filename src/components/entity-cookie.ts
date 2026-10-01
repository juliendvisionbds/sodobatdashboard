// Cookie de l'entité affichée, partagé entre le serveur (src/lib/entity.ts) et
// l'en-tête d'attente, rendu dans le navigateur. Ce module ne doit rien importer.

export const ENTITY_COOKIE = "sdg_entity";

/** Entités du groupe, dans l'ordre du menu. Le serveur dit lesquelles sont ouvertes. */
export const GROUP_ENTITIES: { code: string; name: string }[] = [
  { code: "sodobat", name: "Sodobat" },
  { code: "easymat", name: "Easy Mat" },
  { code: "easyhome", name: "Easy Home" },
  { code: "vbtp", name: "VBTP" },
  { code: "covarbat", name: "CovarBat" },
];

// Rendu HTTP de /alertes : admin voit les actions, lecteur non.
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-sodobat");
const BASE = "http://localhost:3000";

let failures = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "  ✓" : "  ✗ ÉCHEC"} ${label}`);
  if (!ok) failures++;
};

async function fetchAs(role: "admin" | "lecteur") {
  const token = await new SignJWT({
    userId: 1,
    email: `${role}@visionbds.com`,
    name: role,
    role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  const res = await fetch(`${BASE}/alertes`, {
    headers: { cookie: `sdg_session=${token}` },
  });
  const html = (await res.text()).replace(/<!--.*?-->/g, "");
  return { status: res.status, html };
}

async function main() {
  const admin = await fetchAs("admin");
  check("admin : page 200", admin.status === 200);
  check("admin : titre présent", admin.html.includes("Alertes de cohérence"));
  check("admin : action montant constant", admin.html.includes("Marquer comme normal"));
  check("admin : lien Mapping", admin.html.includes("Affecter dans Mapping"));

  const lecteur = await fetchAs("lecteur");
  check("lecteur : page 200 (lecture seule)", lecteur.status === 200);
  // le texte de conseil cite « Marquer comme normal » ; on cible les formulaires d'action
  check("lecteur : aucun formulaire d'action", !lecteur.html.includes('name="alertId"'));
  check("admin : formulaires d'action présents", admin.html.includes('name="alertId"'));

  console.log(failures === 0 ? "\nPage /alertes : OK" : `\n${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

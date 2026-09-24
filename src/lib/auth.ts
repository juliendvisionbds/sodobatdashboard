import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";

const COOKIE = "sdg_session";
const secret = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-sodobat");

export type Role = "admin" | "daf" | "saisie" | "lecteur";

export type Session = {
  userId: number;
  email: string;
  name: string;
  role: Role;
  /** entité du compte ; null ou absent = toutes */
  entityId?: number | null;
};

export async function login(
  email: string,
  password: string
): Promise<Session | null> {
  const [user] = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, email.toLowerCase().trim()));
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  const session: Session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    entityId: user.entityId ?? null,
  };
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600,
    path: "/",
  });
  return session;
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

/** admin et daf peuvent écrire (imports, mapping, saisies, décisions) ; saisie et lecteur non */
export function canWrite(s: Session) {
  return s.role === "admin" || s.role === "daf";
}

/**
 * Saisir la prévision, la note et le statut d'un chantier : les entités
 * (rôle saisie) le font elles-mêmes ; admin et daf aussi.
 */
export function canSaisir(s: Session) {
  return canWrite(s) || s.role === "saisie";
}

/** Figer une saisie, ou la rouvrir : la DAF garde la main sur la validation. */
export function canFiger(s: Session) {
  return canWrite(s);
}

/** Un compte rattaché à une entité n'agit que sur elle. */
export function ownsEntity(s: Session, entityId: number) {
  return s.entityId == null || s.entityId === entityId;
}

/** Garde de page : redirige les lecteurs vers l'accueil (imports, mapping). */
export async function requireWriterOrRedirect(): Promise<Session> {
  const s = await getSession();
  if (!s || !canWrite(s)) redirect("/");
  return s;
}

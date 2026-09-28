import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("sdg_session")?.value;
  if (token) {
    try {
      await jwtVerify(
        token,
        new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-sodobat")
      );
      return NextResponse.next();
    } catch {
      // jeton invalide → login
    }
  }
  // Les appels d'API (assistant) attendent du JSON : une redirection vers la
  // page de connexion se terminerait en 405 illisible côté navigateur.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

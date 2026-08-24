"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/app/actions";

function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <form action={action} className="card" style={{ width: 380 }}>
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Sodobat <span style={{ color: "var(--gray3)", fontWeight: 400 }}>· Groupe SDG</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--gray2)", marginTop: 4 }}>
          Tableaux de gestion
        </div>
      </div>
      <input type="hidden" name="next" value={params.get("next") ?? "/"} />
      <label className="field-label" htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="username"
        className="field-input"
        style={{ marginBottom: 14 }}
        placeholder="votre@email.com"
      />
      <label className="field-label" htmlFor="password">Mot de passe</label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="field-input"
        style={{ marginBottom: 18 }}
      />
      {state?.error && (
        <div className="alert neg" style={{ marginBottom: 14 }}>
          <div className="alert-desc">{state.error}</div>
        </div>
      )}
      <button type="submit" className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}

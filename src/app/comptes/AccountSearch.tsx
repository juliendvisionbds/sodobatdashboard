"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtEur } from "@/lib/format";

export default function AccountSearch({
  accounts,
}: {
  accounts: { account: string; label: string; total: number }[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      `${a.account} ${a.label}`.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  return (
    <div style={{ marginTop: 8 }}>
      <div className="table-controls">
        <input
          className="tctl-input"
          placeholder="Rechercher un compte (numéro ou intitulé)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <span style={{ fontSize: 11, color: "var(--gray3)", alignSelf: "center" }}>
          {filtered.length} compte{filtered.length > 1 ? "s" : ""} sur {accounts.length}
        </span>
      </div>
      <div className="table-wrap">
        <table className="ct">
          <thead>
            <tr>
              <th className="left">Compte</th>
              <th className="left">Intitulé</th>
              <th>Cumul exercice</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.account}>
                <td className="code-cell">
                  <Link href={`/comptes/${a.account}`}>{a.account}</Link>
                </td>
                <td className="label-cell">
                  <Link href={`/comptes/${a.account}`}>{a.label}</Link>
                </td>
                <td className={a.total < 0 ? "neg" : ""}>{fmtEur(a.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

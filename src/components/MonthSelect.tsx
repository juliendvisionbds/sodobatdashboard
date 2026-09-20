"use client";

import { useRouter } from "next/navigation";
import { monthLabelLong } from "@/lib/format";

export default function MonthSelect({
  basePath,
  periods,
  current,
  extraQuery,
}: {
  basePath: string;
  periods: string[];
  current: string;
  /** paramètres à conserver au changement de mois, ex. « vue=mensuel » */
  extraQuery?: string;
}) {
  const router = useRouter();
  return (
    <select
      className="tctl-select"
      value={current}
      disabled={periods.length < 2}
      title={periods.length < 2 ? "Un seul mois disponible pour l'instant" : undefined}
      onChange={(e) => router.push(`${basePath}?mois=${e.target.value}${extraQuery ? `&${extraQuery}` : ""}`)}
      aria-label="Choisir le mois affiché"
    >
      {periods.map((p) => (
        <option key={p} value={p}>
          {monthLabelLong(p)}
        </option>
      ))}
    </select>
  );
}

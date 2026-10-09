"use client";

import { useRouter } from "next/navigation";
import { monthLabelLong } from "@/lib/format";

export default function MonthSelect({
  basePath,
  periods,
  current,
  extraQuery,
  prefix = "",
  large = false,
}: {
  basePath: string;
  periods: string[];
  current: string;
  /** paramètres à conserver au changement de mois, ex. « vue=mensuel » */
  extraQuery?: string;
  /** texte placé devant le mois, ex. « Arrêté à » (le mois passe alors en minuscules) */
  prefix?: string;
  /** gabarit des réglages de l'en-tête de page */
  large?: boolean;
}) {
  const router = useRouter();
  return (
    <select
      className={`tctl-select${large ? " lg" : ""}`}
      value={current}
      disabled={periods.length < 2}
      title={periods.length < 2 ? "Un seul mois disponible pour l'instant" : undefined}
      onChange={(e) => router.push(`${basePath}?mois=${e.target.value}${extraQuery ? `&${extraQuery}` : ""}`)}
      aria-label="Choisir le mois affiché"
    >
      {periods.map((p) => (
        <option key={p} value={p}>
          {prefix ? `${prefix} ${monthLabelLong(p).toLowerCase()}` : monthLabelLong(p)}
        </option>
      ))}
    </select>
  );
}

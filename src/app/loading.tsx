import HeaderSkeleton from "@/components/HeaderSkeleton";

// Écran d'attente d'une vue : affiché dès le clic, pendant que le serveur
// calcule les tableaux. Il reprend la silhouette des pages (titre, bandeau de
// KPI, tableau) pour que le contenu arrive sans que la mise en page bouge.
export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="page" aria-busy="true" aria-live="polite">
        <div className="page-header">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-text" style={{ width: 360 }} />
        </div>
        <div className="kpi-strip">
          {[0, 1, 2, 3].map((i) => (
            <div className="kpi" key={i}>
              <div className="skeleton skeleton-text" style={{ width: 110 }} />
              <div className="skeleton skeleton-kpi" />
              <div className="skeleton skeleton-text" style={{ width: 140 }} />
            </div>
          ))}
        </div>
        <div className="card">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div className="skeleton skeleton-row" key={i} style={{ width: `${100 - (i % 3) * 6}%` }} />
          ))}
        </div>
        <p className="skeleton-hint">Calcul des tableaux…</p>
      </div>
    </>
  );
}

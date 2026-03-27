import { useState } from "react";
import { Session, Article } from "../types";
import { api } from "../api";

interface Props {
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  catalogue: Article[];
}

export default function Sessions({ sessions, setSessions, catalogue }: Props) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [openSessions, setOpenSessions] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const skuMap: Record<string, Article> = {};
  catalogue.forEach(a => { skuMap[a.sku] = a; });

  const filteredSessions = sessions.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && s.type !== filterType) return false;
    return true;
  });

  const toggleSess = (id: string) => {
    setOpenSessions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const buildComparison = (s: Session) => {
    const items: {
      sku: string; article: Article | null; cnt: number; qte?: number;
      ecartPos: number; ecartNeg: number; fromPack: boolean;
    }[] = [];
    const done = new Set<string>();
    (s.packing || []).forEach(pl => {
      const cnt = (s.scans || {})[pl.sku] || 0;
      const diff = cnt - pl.qte;
      items.push({
        sku: pl.sku, article: skuMap[pl.sku] || null, cnt, qte: pl.qte,
        ecartPos: diff > 0 ? diff : 0,
        ecartNeg: diff < 0 ? diff : 0,
        fromPack: true,
      });
      done.add(pl.sku);
    });
    Object.entries(s.scans || {}).forEach(([sku, cnt]) => {
      if (done.has(sku)) return;
      items.push({ sku, article: skuMap[sku] || null, cnt, ecartPos: 0, ecartNeg: 0, fromPack: false });
    });
    return items;
  };

  const buildCatGroups = (s: Session) => {
    const groups: Record<string, { cnt: number; defective: number }> = {};
    Object.entries(s.scans || {}).forEach(([sku, cnt]) => {
      const cat = skuMap[sku]?.cat || "Inconnu";
      if (!groups[cat]) groups[cat] = { cnt: 0, defective: 0 };
      groups[cat].cnt += cnt;
    });
    (s.defectiveItems || []).forEach(d => {
      const cat = d.cat || skuMap[d.sku]?.cat || "Inconnu";
      if (!groups[cat]) groups[cat] = { cnt: 0, defective: 0 };
      groups[cat].defective += 1;
    });
    return groups;
  };

  const exportXlsx = (id: string) => {
    const a = document.createElement("a");
    a.href = api.exportSessionUrl(id);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await api.deleteSession(deleteTarget.id);
    setSessions(sessions.filter(s => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleString("fr-FR"); } catch { return d; }
  };

  const totalScanned = (s: Session) => Object.values(s.scans || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Sessions</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="search-input" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Tous les types</option>
            <option value="officielle">Officielle</option>
            <option value="test">Test</option>
            <option value="inventaire">Inventaire</option>
            <option value="retour">Retour</option>
          </select>
        </div>
      </div>

      {filteredSessions.length === 0 ? (
        <div className="empty-state">Aucune session trouvée</div>
      ) : (
        <div className="sessions-list">
          {filteredSessions.map(s => {
            const isOpen = openSessions.has(s.id);
            const comparison = buildComparison(s);
            const catGroups = buildCatGroups(s);
            const defectCount = (s.defectiveItems || []).length;
            const conformCount = totalScanned(s) - defectCount;
            const hasVariance = comparison.some(r => r.ecartPos > 0 || r.ecartNeg < 0);

            return (
              <div key={s.id} className="session-card">
                <div className="session-card-header" onClick={() => toggleSess(s.id)}>
                  <div className="session-card-info">
                    <div className="session-card-name">{s.name}</div>
                    <div className="session-card-meta">
                      <span className="badge badge-blue">{s.mode}</span>
                      <span className="badge badge-gray">{s.type}</span>
                      {s.shop && <span className="badge badge-gray">{s.shop}</span>}
                      <span className="muted">{formatDate(s.startDate)}</span>
                    </div>
                  </div>
                  <div className="session-card-stats">
                    <span className="stat-chip">{totalScanned(s)} scannés</span>
                    {defectCount > 0 && <span className="stat-chip stat-chip-red">⚠ {defectCount} défectueux</span>}
                    {conformCount > 0 && <span className="stat-chip stat-chip-green">✓ {conformCount} conformes</span>}
                    {s.stockAdded && <span className="badge badge-green">Stock +</span>}
                    <span className="toggle-arrow">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="session-card-body">
                    {/* Stats summary */}
                    <div className="session-summary-row">
                      <div className="summary-stat">
                        <span className="summary-stat-value">{totalScanned(s)}</span>
                        <span className="summary-stat-label">Total scanné</span>
                      </div>
                      <div className="summary-stat summary-stat-red">
                        <span className="summary-stat-value">{defectCount}</span>
                        <span className="summary-stat-label">Défectueux</span>
                      </div>
                      <div className="summary-stat summary-stat-green">
                        <span className="summary-stat-value">{conformCount}</span>
                        <span className="summary-stat-label">Conformes</span>
                      </div>
                      {hasVariance && (
                        <>
                          <div className="summary-stat summary-stat-orange">
                            <span className="summary-stat-value">{comparison.filter(r => r.ecartPos > 0).length}</span>
                            <span className="summary-stat-label">Surplus</span>
                          </div>
                          <div className="summary-stat summary-stat-red">
                            <span className="summary-stat-value">{comparison.filter(r => r.ecartNeg < 0).length}</span>
                            <span className="summary-stat-label">Manquants</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Category breakdown */}
                    {Object.keys(catGroups).length > 0 && (
                      <div className="cat-groups">
                        <div className="subsection-title">Par catégorie</div>
                        <div className="cat-tags">
                          {Object.entries(catGroups).map(([cat, g]) => (
                            <span key={cat} className="cat-tag">
                              {cat}: {g.cnt} pcs{g.defective > 0 ? ` (⚠ ${g.defective} défectueux)` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Comparison table */}
                    {comparison.length > 0 && (
                      <div className="subsection">
                        <div className="subsection-title">Détail des scans</div>
                        <div className="table-wrap">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>SKU</th>
                                <th>Produit</th>
                                <th>Taille</th>
                                <th>Scanné</th>
                                <th>Attendu</th>
                                <th style={{ color: "var(--green)" }}>Écart ＋</th>
                                <th style={{ color: "var(--red)" }}>Écart −</th>
                                <th>Statut</th>
                              </tr>
                            </thead>
                            <tbody>
                              {comparison.map(r => (
                                <tr key={r.sku}>
                                  <td className="mono">{r.sku}</td>
                                  <td>{r.article?.nom || r.sku}</td>
                                  <td>{r.article?.taille || "—"}</td>
                                  <td className="num">{r.cnt}</td>
                                  <td className="num">{r.qte ?? "—"}</td>
                                  <td className="num ecart-pos">{r.ecartPos > 0 ? `+${r.ecartPos}` : "—"}</td>
                                  <td className="num ecart-neg">{r.ecartNeg < 0 ? `${r.ecartNeg}` : "—"}</td>
                                  <td>
                                    {!r.fromPack ? <span className="badge badge-gray">Hors liste</span> :
                                      r.ecartPos > 0 ? <span className="badge badge-orange">Surplus</span> :
                                      r.ecartNeg < 0 ? <span className="badge badge-red">Manquant</span> :
                                      <span className="badge badge-green">Conforme</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Defective items */}
                    {(s.defectiveItems || []).length > 0 && (
                      <div className="subsection">
                        <div className="subsection-title">Articles défectueux ({s.defectiveItems!.length})</div>
                        <div className="table-wrap">
                          <table className="data-table">
                            <thead>
                              <tr><th>SKU</th><th>Produit</th><th>Type défaut</th><th>Note</th></tr>
                            </thead>
                            <tbody>
                              {(s.defectiveItems || []).map((d, i) => (
                                <tr key={i}>
                                  <td className="mono">{d.sku}</td>
                                  <td>{d.nom}</td>
                                  <td><span className="badge badge-red">{d.defectType}</span></td>
                                  <td className="muted">{d.note || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {s.note && <div className="session-note">📝 {s.note}</div>}

                    <div className="session-card-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => exportXlsx(s.id)}>⬇ Export Excel</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget({ id: s.id, name: s.name })}>🗑 Supprimer</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header"><h3>Supprimer la session ?</h3></div>
            <div className="modal-body">
              <p>Cette action est irréversible. La session <strong>{deleteTarget.name}</strong> sera définitivement supprimée.</p>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>Annuler</button>
                <button className="btn btn-danger" onClick={confirmDelete}>🗑 Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

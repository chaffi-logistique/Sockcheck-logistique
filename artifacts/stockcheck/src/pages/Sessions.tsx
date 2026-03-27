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
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
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

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const buildComparison = (s: Session) => {
    const items: { sku: string; article: Article | null; cnt: number; qte?: number; ecart: number; fromPack: boolean }[] = [];
    (s.packing || []).forEach(pl => {
      const cnt = (s.scans || {})[pl.sku] || 0;
      items.push({ sku: pl.sku, article: skuMap[pl.sku] || null, cnt, qte: pl.qte, ecart: cnt - pl.qte, fromPack: true });
    });
    Object.entries(s.scans || {}).forEach(([sku, cnt]) => {
      if (items.find(r => r.sku === sku)) return;
      items.push({ sku, article: skuMap[sku] || null, cnt, qte: 0, ecart: cnt, fromPack: false });
    });
    return items;
  };

  const confirmDelete = (id: string, name: string) => setDeleteTarget({ id, name });

  const doDelete = async () => {
    if (!deleteTarget) return;
    setSessions(sessions.filter(s => s.id !== deleteTarget.id));
    setDeleteTarget(null);
    try { await api.deleteSession(deleteTarget.id); } catch (e) { console.error(e); }
  };

  const exportSession = (id: string) => {
    const a = document.createElement("a");
    a.href = api.exportSessionUrl(id);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const typeLabels: Record<string, string> = { officielle: "Session officielle", test: "Test interne", fast: "Fast test" };
  const typeBadge: Record<string, string> = { officielle: "badge-blue", test: "badge-grey", fast: "badge-orange" };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="toolbar">
        <div className="toolbar-title">Sessions enregistrées</div>
        <div className="spacer" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ width: 180 }} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 150 }}>
          <option value="">Tous les types</option>
          <option value="officielle">Session officielle</option>
          <option value="test">Test interne</option>
          <option value="fast">Fast test</option>
        </select>
      </div>
      <div className="scroll">
        <div className="sessions-list">
          {filteredSessions.length === 0
            ? <div style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>Aucune session enregistrée</div>
            : filteredSessions.map(s => {
              const dt = new Date(s.startDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
              const items = buildComparison(s);
              const total = Object.values(s.scans || {}).reduce((a, b) => a + b, 0);
              const manquants = items.filter(i => i.ecart < 0).length;
              const surplus = items.filter(i => i.ecart > 0 && i.fromPack).length;
              const isOpen = openSessions.has(s.id);

              const catMap: Record<string, Record<string, typeof items>> = {};
              items.forEach(item => {
                const cat = item.article ? item.article.cat : "Inconnu";
                const nom = item.article ? item.article.nom : item.sku;
                if (!catMap[cat]) catMap[cat] = {};
                if (!catMap[cat][nom]) catMap[cat][nom] = [];
                catMap[cat][nom].push(item);
              });

              return (
                <div key={s.id} className="session-card">
                  <div className="session-card-hd" onClick={() => toggleSess(s.id)}>
                    <span className="sess-chevron" style={{ transform: isOpen ? "rotate(90deg)" : "" }}>▶</span>
                    <div>
                      <div className="sess-name">{s.name}</div>
                      <div className="sess-meta">{dt} · {s.mode}{s.shop ? ` · ${s.shop}` : ""}</div>
                    </div>
                    <div className="sess-tags">
                      <span className={`badge ${typeBadge[s.type] || "badge-grey"}`}>{typeLabels[s.type] || s.type}</span>
                      {s.stockAdded
                        ? <span className="badge badge-green">Stock mis à jour</span>
                        : <span className="badge badge-grey">Test</span>
                      }
                    </div>
                  </div>
                  {isOpen && (
                    <div className="session-card-body open">
                      <div className="sess-summary">
                        <div className="sess-sum-item"><div className="sess-sum-n" style={{ color: "var(--acc)" }}>{total}</div><div className="sess-sum-l">Scannés</div></div>
                        <div className="sess-sum-item"><div className="sess-sum-n" style={{ color: manquants > 0 ? "var(--red)" : "var(--green)" }}>{manquants}</div><div className="sess-sum-l">Manquants</div></div>
                        <div className="sess-sum-item"><div className="sess-sum-n" style={{ color: surplus > 0 ? "var(--orange)" : "var(--green)" }}>{surplus}</div><div className="sess-sum-l">Surplus</div></div>
                      </div>
                      {s.note && (
                        <div className="sess-note-area">
                          <div className="sess-note-lbl">Note</div>
                          <div className="sess-note-txt">{s.note}</div>
                        </div>
                      )}
                      {items.length === 0
                        ? <div style={{ padding: 16, color: "var(--muted)", fontSize: 13, textAlign: "center" }}>Aucun article scanné</div>
                        : Object.entries(catMap).map(([cat, noms]) => {
                          const catId = s.id + "_" + cat.replace(/\s/g, "_");
                          const catTotal = Object.values(noms).flat().reduce((a, i) => a + i.cnt, 0);
                          const catOpen = openGroups.has(catId);
                          return (
                            <div key={catId} className="cat-group">
                              <div className="cat-group-hd" onClick={() => toggleGroup(catId)}>
                                <span style={{ fontSize: 10, transition: ".2s", transform: catOpen ? "rotate(90deg)" : "" }}>▶</span>
                                <span>{cat}</span>
                                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>{catTotal} pcs</span>
                              </div>
                              {catOpen && (
                                <div className="cat-group-body open">
                                  {Object.entries(noms).map(([nom, arts]) => {
                                    const subId = catId + "_" + nom.replace(/\s/g, "_");
                                    const subTotal = arts.reduce((a, i) => a + i.cnt, 0);
                                    const subOpen = openGroups.has(subId);
                                    return (
                                      <div key={subId} className="subcat-group">
                                        <div className="subcat-group-hd" onClick={() => toggleGroup(subId)}>
                                          <span style={{ fontSize: 10, color: "var(--muted)", transition: ".2s", transform: subOpen ? "rotate(90deg)" : "" }}>▶</span>
                                          <span>{nom}</span>
                                          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>{subTotal} pcs</span>
                                        </div>
                                        {subOpen && (
                                          <div className="subcat-body open">
                                            <div className="art-row" style={{ background: "var(--surface2)", fontWeight: 600, fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".3px" }}>
                                              <span className="art-name"></span>
                                              <span className="art-size">Taille</span>
                                              <span className="art-scanned">Scanné</span>
                                              <span className="art-expected">Attendu</span>
                                              <span className="art-diff">Écart</span>
                                            </div>
                                            {arts.map((item, idx) => {
                                              const ecartClass = item.ecart === 0 ? "zero" : item.ecart > 0 ? "pos" : "neg";
                                              const ecartTxt = item.ecart === 0 ? "✓" : item.ecart > 0 ? `+${item.ecart}` : String(item.ecart);
                                              return (
                                                <div key={idx} className="art-row">
                                                  <span className="art-name">{!item.article && <span style={{ color: "var(--red)" }}>SKU inconnu</span>}</span>
                                                  <span className="art-size badge badge-blue">{item.article ? item.article.taille : "?"}</span>
                                                  <span className="art-scanned">{item.cnt}</span>
                                                  <span className="art-expected" style={{ color: "var(--muted)" }}>{item.qte || "—"}</span>
                                                  <span className={`art-diff ${ecartClass}`}>{ecartTxt}</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      }
                      <div className="sess-actions">
                        <button className="btn btn-outline btn-sm" onClick={() => exportSession(s.id)}>⬇ Export Excel</button>
                        <button className="btn btn-danger btn-sm" onClick={() => confirmDelete(s.id, s.name)} style={{ marginLeft: "auto" }}>🗑 Supprimer</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          }
        </div>
      </div>

      {deleteTarget && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="modal" style={{ width: 380 }}>
            <div className="modal-hd"><div className="modal-hd-title">Confirmer la suppression</div></div>
            <div className="modal-body">
              <p style={{ color: "var(--text2)" }}>Supprimer la session "{deleteTarget.name}" ? Cette action est irréversible.</p>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>Annuler</button>
              <button className="btn btn-danger" onClick={doDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

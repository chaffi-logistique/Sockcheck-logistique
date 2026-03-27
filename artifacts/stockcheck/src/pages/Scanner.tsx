import { useState, useEffect, useRef, useCallback } from "react";
import { Article, PackingItem, LogEntry, Session, Mode, FilterType } from "../types";
import { api } from "../api";

interface Props {
  catalogue: Article[];
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  savedState: {
    currentSession: Session | null;
    packingList: PackingItem[];
    scanLog: LogEntry[];
    sessionScans: Record<string, number>;
    mode: Mode;
  };
  onStateChange: (s: {
    currentSession: Session | null;
    packingList: PackingItem[];
    scanLog: LogEntry[];
    sessionScans: Record<string, number>;
    mode: Mode;
  }) => void;
  markUnsaved: () => void;
  markSaved: () => void;
}

export default function Scanner({ catalogue, sessions, setSessions, savedState, onStateChange, markUnsaved, markSaved }: Props) {
  const [mode, setMode] = useState<Mode>(savedState.mode);
  const [sessName, setSessName] = useState(savedState.currentSession?.name || "");
  const [sessType, setSessType] = useState(savedState.currentSession?.type || "officielle");
  const [shopInput, setShopInput] = useState(savedState.currentSession?.shop || "");
  const [currentSession, setCurrentSession] = useState<Session | null>(savedState.currentSession);
  const [packingList, setPackingList] = useState<PackingItem[]>(savedState.packingList);
  const [sessionScans, setSessionScans] = useState<Record<string, number>>(savedState.sessionScans);
  const [scanLog, setScanLog] = useState<LogEntry[]>(savedState.scanLog);
  const [scanFb, setScanFb] = useState<{ txt: string; type: string }>({ txt: "En attente de scan...", type: "" });
  const [liveFilter, setLiveFilter] = useState<FilterType>("all");
  const [showPackingModal, setShowPackingModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [stockAction, setStockAction] = useState<"no" | "yes">("no");
  const [endSessNote, setEndSessNote] = useState("");
  const [plSku, setPlSku] = useState("");
  const [plQte, setPlQte] = useState(1);
  const [plSuggestions, setPlSuggestions] = useState<Article[]>([]);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const skuMap = useRef<Record<string, Article>>({});

  useEffect(() => {
    const map: Record<string, Article> = {};
    catalogue.forEach(a => { map[a.sku] = a; map[a.sku.toUpperCase()] = a; });
    skuMap.current = map;
  }, [catalogue]);

  useEffect(() => {
    onStateChange({ currentSession, packingList, scanLog, sessionScans, mode });
  }, [currentSession, packingList, scanLog, sessionScans, mode]);

  const showFb = (txt: string, type: string) => {
    setScanFb({ txt, type });
  };

  const updateStats = useCallback(() => {
    return {
      total: Object.values(sessionScans).reduce((a, b) => a + b, 0),
      ok: Object.entries(sessionScans).filter(([sku, cnt]) => {
        const pl = packingList.find(p => p.sku === sku);
        return pl && cnt === pl.qte;
      }).length,
      prob: Object.entries(sessionScans).filter(([sku, cnt]) => {
        const pl = packingList.find(p => p.sku === sku);
        return !pl || cnt !== pl.qte;
      }).length,
    };
  }, [sessionScans, packingList]);

  const stats = updateStats();

  const processScan = useCallback((raw: string) => {
    const sku = raw.trim();
    const article = skuMap.current[sku] || skuMap.current[sku.toUpperCase()];
    const now = new Date();
    const timeStr = now.toTimeString().substring(0, 8);

    setSessionScans(prev => {
      const updated = { ...prev, [sku]: (prev[sku] || 0) + 1 };
      const count = updated[sku];

      if (!article) {
        showFb(`⚠ SKU inconnu : ${sku}`, "warn");
        setScanLog(log => [{
          time: timeStr, icon: "⚠", txt: `SKU inconnu : ${sku}`, type: "warn"
        }, ...log.slice(0, 49)]);
      } else {
        const pl = packingList.find(p => p.sku === sku);
        const expected = pl?.qte;
        if (expected !== undefined) {
          if (count > expected) {
            showFb(`⬆ Surplus : ${article.nom} ${article.taille} (${count}/${expected})`, "warn");
          } else if (count === expected) {
            showFb(`✓ Complet : ${article.nom} ${article.taille}`, "ok");
          } else {
            showFb(`✓ ${article.nom} ${article.taille} (${count}/${expected})`, "ok");
          }
        } else {
          showFb(`✓ ${article.nom} ${article.taille} (×${count})`, "ok");
        }
        setScanLog(log => [{
          time: timeStr,
          icon: "✓",
          txt: `${article.nom} ${article.taille} — ${sku}`,
          type: "ok"
        }, ...log.slice(0, 49)]);
      }
      markUnsaved();
      return updated;
    });
  }, [packingList, markUnsaved]);

  const undoScan = () => {
    if (!scanLog.length) return;
    const last = scanLog[0];
    const match = last.txt.match(/— ([A-Z0-9\-]+)$/);
    if (!match) {
      setScanLog(prev => prev.slice(1));
      return;
    }
    const sku = match[1];
    setSessionScans(prev => {
      if (!prev[sku]) return prev;
      const updated = { ...prev };
      updated[sku]--;
      if (updated[sku] <= 0) delete updated[sku];
      return updated;
    });
    setScanLog(prev => prev.slice(1));
    showFb(`↩ Annulé : ${sku}`, "info");
    markUnsaved();
  };

  const startSession = () => {
    const name = sessName.trim() || `Session du ${new Date().toLocaleDateString("fr-FR")}`;
    const sess: Session = {
      id: String(Date.now()),
      name,
      type: sessType,
      mode,
      shop: shopInput,
      packing: [...packingList],
      startDate: new Date().toISOString(),
      endDate: null,
      note: "",
      stockAdded: false,
      scans: {},
      log: [],
    };
    setCurrentSession(sess);
    setSessionScans({});
    setScanLog([]);
    setSessName(name);
    markUnsaved();
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  const confirmEndSession = () => {
    if (!currentSession) return;
    setStockAction("no");
    setEndSessNote("");
    setShowEndModal(true);
  };

  const endSession = async () => {
    if (!currentSession) return;
    const completed: Session = {
      ...currentSession,
      endDate: new Date().toISOString(),
      note: endSessNote,
      scans: { ...sessionScans },
      log: [...scanLog],
      stockAdded: stockAction === "yes",
    };
    setSessions([completed, ...sessions]);
    setCurrentSession(null);
    setSessionScans({});
    setScanLog([]);
    setShowEndModal(false);
    try {
      await api.saveSession(completed);
      await api.saveState({ currentSession: null, packingList, scanLog: [], sessionScans: {}, mode });
      markSaved();
    } catch (e) {
      console.error("Error ending session", e);
    }
  };

  const addPackLine = () => {
    const sku = plSku.trim();
    const a = skuMap.current[sku];
    if (!sku) return;
    if (!a) { alert(`SKU "${sku}" non trouvé dans le catalogue.`); return; }
    setPackingList(prev => {
      const ex = prev.find(p => p.sku === sku);
      if (ex) return prev.map(p => p.sku === sku ? { ...p, qte: p.qte + plQte } : p);
      return [...prev, { sku, qte: plQte, nom: a.nom, taille: a.taille }];
    });
    setPlSku("");
    setPlQte(1);
    setPlSuggestions([]);
    markUnsaved();
  };

  const removePl = (i: number) => {
    setPackingList(prev => prev.filter((_, idx) => idx !== i));
    markUnsaved();
  };

  const plSuggest = (q: string) => {
    setPlSku(q);
    if (!q) { setPlSuggestions([]); return; }
    const lq = q.toLowerCase();
    setPlSuggestions(catalogue.filter(a =>
      a.sku.toLowerCase().includes(lq) || a.nom.toLowerCase().includes(lq)
    ).slice(0, 8));
  };

  const packSummary = packingList.length === 0
    ? "Aucune packing list"
    : `${packingList.length} références · ${packingList.reduce((s, p) => s + p.qte, 0)} articles attendus`;

  // Build live table rows
  const liveRows = (() => {
    const rows: {
      sku: string; article: Article | null; cnt: number; qte: number | undefined; ecart: number;
    }[] = [];
    const seen = new Set<string>();
    (currentSession?.packing || packingList).forEach(pl => {
      seen.add(pl.sku);
      const cnt = sessionScans[pl.sku] || 0;
      rows.push({ sku: pl.sku, article: skuMap.current[pl.sku] || null, cnt, qte: pl.qte, ecart: cnt - pl.qte });
    });
    Object.entries(sessionScans).forEach(([sku, cnt]) => {
      if (seen.has(sku)) return;
      rows.push({ sku, article: skuMap.current[sku] || null, cnt, qte: undefined, ecart: cnt });
    });
    return rows.filter(r => {
      if (liveFilter === "all") return true;
      if (liveFilter === "manquant") return r.ecart < 0;
      if (liveFilter === "surplus") return r.ecart > 0 && r.qte !== undefined;
      if (liveFilter === "ok") return r.ecart === 0 && r.qte !== undefined;
      if (liveFilter === "inconnu") return r.article === null;
      return true;
    });
  })();

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* SIDEBAR */}
      <div style={{
        width: 320, background: "var(--surface)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", overflowY: "auto", padding: 16, gap: 14
      }}>

        {/* Mode */}
        <div>
          <div className="section-label">Mode de session</div>
          <div className="mode-grid">
            {([
              { key: "reception", icon: "📥", label: "Réception", sub: "Stock entrant" },
              { key: "retour", icon: "↩", label: "Retour Shop", sub: "Magasin partenaire" },
              { key: "test", icon: "🧪", label: "Test", sub: "Sans impact stock" },
              { key: "inventaire", icon: "🔍", label: "Inventaire", sub: "Comptage seul" },
            ] as const).map(m => (
              <button
                key={m.key}
                className={`mode-btn${mode === m.key ? " active" : ""}`}
                onClick={() => setMode(m.key as Mode)}
              >
                {m.icon} {m.label}<br /><small style={{ fontWeight: 400, opacity: .7 }}>{m.sub}</small>
              </button>
            ))}
          </div>
        </div>

        {mode === "retour" && (
          <div>
            <label>Magasin partenaire</label>
            <input type="text" value={shopInput} onChange={e => setShopInput(e.target.value)} placeholder="Nom du magasin..." />
          </div>
        )}

        {mode !== "retour" && mode !== "inventaire" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div className="section-label" style={{ margin: 0 }}>Packing List</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPackingModal(true)}>Définir</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{packSummary}</div>
          </div>
        )}

        <div className="divider" />

        {/* Session */}
        <div>
          <div className="section-label">Session</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <label>Nom de la session</label>
              <input type="text" value={sessName} onChange={e => setSessName(e.target.value)} placeholder="ex: Réception Pinky Drop" />
            </div>
            <div>
              <label>Type</label>
              <select value={sessType} onChange={e => setSessType(e.target.value)}>
                <option value="officielle">Session officielle</option>
                <option value="test">Test interne</option>
                <option value="fast">Fast test</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={startSession}
                disabled={!!currentSession}
              >▶ Démarrer</button>
              <button
                className="btn btn-danger btn-lg"
                onClick={confirmEndSession}
                disabled={!currentSession}
              >■ Terminer</button>
            </div>
          </div>
        </div>

        {/* Scan zone */}
        <div>
          <div className="section-label">Zone de scan</div>
          <div className={`scan-zone${currentSession ? " active-scan" : ""}`}>
            <label>Positionne le curseur ici → scanner avec la scanette</label>
            <input
              ref={scanInputRef}
              type="text"
              className="scan-input"
              placeholder="Scan ou SKU + Entrée"
              autoComplete="off"
              disabled={!currentSession}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v && currentSession) processScan(v);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
          <div className={`scan-fb${scanFb.type ? " " + scanFb.type : ""}`} style={{ marginTop: 8 }}>
            {scanFb.txt}
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-mini">
            <div className="stat-mini-n" style={{ color: "var(--acc)" }}>{stats.total}</div>
            <div className="stat-mini-l">Total</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-n" style={{ color: "var(--green)" }}>{stats.ok}</div>
            <div className="stat-mini-l">Conformes</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-n" style={{ color: "var(--red)" }}>{stats.prob}</div>
            <div className="stat-mini-l">Écarts</div>
          </div>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={undoScan} style={{ width: "100%" }}>↩ Annuler dernier scan</button>

        {/* Log */}
        <div className="log-box">
          <div className="log-hd">Historique de scan</div>
          <div className="log-scroll">
            {scanLog.length === 0
              ? <div style={{ padding: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>Aucun scan</div>
              : scanLog.map((e, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">{e.time}</span>
                  <span className="log-icon">{e.icon}</span>
                  <span className="log-txt">{e.txt}</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        <div className="session-bar">
          <div className="sess-status">
            <div className={`sess-dot${currentSession ? " active" : " idle"}`} />
            <span>{currentSession ? currentSession.name : "Aucune session active"}</span>
          </div>
          {currentSession && (
            <span style={{ color: "var(--muted)" }}>{currentSession.type} · {currentSession.mode}</span>
          )}
          <div className="spacer" />
          <div className="filter-btns">
            {(["all", "manquant", "surplus", "ok", "inconnu"] as FilterType[]).map(f => (
              <button
                key={f}
                className={`fbtn${liveFilter === f ? " active" : ""}`}
                onClick={() => setLiveFilter(f)}
              >
                {{ all: "Tous", manquant: "Manquants", surplus: "Surplus", ok: "Conformes", inconnu: "Inconnus" }[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Article</th>
                <th>SKU</th>
                <th>Catégorie</th>
                <th>Taille</th>
                <th>Attendu</th>
                <th>Scanné</th>
                <th>Progression</th>
                <th>Écart</th>
              </tr>
            </thead>
            <tbody>
              {liveRows.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
                  {currentSession ? "Aucun article pour ce filtre" : "Démarre une session pour voir le suivi en temps réel"}
                </td></tr>
              ) : liveRows.map(r => {
                const pct = r.qte ? Math.min(100, Math.round((r.cnt / r.qte) * 100)) : 100;
                const bc = r.qte === undefined ? "ok" : r.cnt > r.qte ? "over" : r.cnt < r.qte ? "low" : "ok";
                const ecart = r.qte === undefined ? `+${r.cnt}` : r.ecart === 0 ? "✓" : r.ecart > 0 ? `+${r.ecart}` : String(r.ecart);
                const ecartClass = r.ecart === 0 ? "zero" : r.ecart > 0 ? "pos" : "neg";
                const badgeClass = r.ecart === 0 ? "badge-green" : r.ecart < 0 ? "badge-red" : "badge-orange";
                return (
                  <tr key={r.sku}>
                    <td>{r.article ? r.article.nom : <span style={{ color: "var(--red)" }}>SKU inconnu</span>}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{r.sku}</td>
                    <td>{r.article ? <span className="badge badge-grey">{r.article.cat}</span> : "—"}</td>
                    <td>{r.article ? <span className="badge badge-blue">{r.article.taille}</span> : "—"}</td>
                    <td style={{ textAlign: "center", color: "var(--muted)" }}>{r.qte ?? "—"}</td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{r.cnt}</td>
                    <td>
                      <div className="prog">
                        <div className="prog-bar"><div className={`prog-fill ${bc}`} style={{ width: `${pct}%` }} /></div>
                        <span className="prog-lbl">{r.cnt}/{r.qte ?? "?"}</span>
                      </div>
                    </td>
                    <td><span className={`badge ${badgeClass}`}>{ecart}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PACKING MODAL */}
      {showPackingModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setShowPackingModal(false); }}>
          <div className="modal" style={{ width: 620 }}>
            <div className="modal-hd">
              <div className="modal-hd-title">Packing List</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPackingModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, alignItems: "end" }}>
                <div style={{ position: "relative" }}>
                  <label>SKU</label>
                  <input type="text" value={plSku} onChange={e => plSuggest(e.target.value)} placeholder="ex: TEE-M-FLGO" />
                  {plSuggestions.length > 0 && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0,
                      border: "1px solid var(--border2)", borderRadius: "var(--radius)",
                      marginTop: 2, maxHeight: 120, overflowY: "auto",
                      background: "var(--surface)", boxShadow: "var(--shadow)", zIndex: 100
                    }}>
                      {plSuggestions.map(a => (
                        <div
                          key={a.sku}
                          style={{ padding: "7px 12px", cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--border)" }}
                          onMouseDown={() => { setPlSku(a.sku); setPlSuggestions([]); }}
                        >
                          <span style={{ fontFamily: "var(--mono)" }}>{a.sku}</span>
                          <span style={{ color: "var(--muted)" }}>{a.nom} · {a.taille}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label>Qté attendue</label>
                  <input type="number" value={plQte} min={1} onChange={e => setPlQte(parseInt(e.target.value) || 1)} />
                </div>
                <button className="btn btn-primary" style={{ height: 36 }} onClick={addPackLine}>+ Ajouter</button>
              </div>
              <table className="tbl">
                <thead><tr><th>SKU</th><th>Article</th><th>Taille</th><th>Qté</th><th></th></tr></thead>
                <tbody>
                  {packingList.length === 0
                    ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 20, color: "var(--muted)" }}>Aucune ligne</td></tr>
                    : packingList.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{p.sku}</td>
                        <td>{p.nom}</td>
                        <td><span className="badge badge-blue">{p.taille}</span></td>
                        <td style={{ fontWeight: 600, textAlign: "center" }}>{p.qte}</td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => removePl(i)}>✕</button></td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline btn-sm" onClick={() => { setPackingList([]); markUnsaved(); }}>Vider</button>
              <button className="btn btn-primary" onClick={() => setShowPackingModal(false)}>✓ Valider</button>
            </div>
          </div>
        </div>
      )}

      {/* END SESSION MODAL */}
      {showEndModal && currentSession && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setShowEndModal(false); }}>
          <div className="modal" style={{ width: 480 }}>
            <div className="modal-hd">
              <div className="modal-hd-title">Terminer la session</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEndModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text2)" }}>Tu es sur le point de clôturer cette session.</p>
              <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 12, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{currentSession.name} — {currentSession.type}</div>
                <div style={{ color: "var(--muted)" }}>
                  {Object.values(sessionScans).reduce((a, b) => a + b, 0)} articles scannés
                </div>
              </div>
              <div>
                <label>Note sur la session (optionnel)</label>
                <textarea value={endSessNote} onChange={e => setEndSessNote(e.target.value)} placeholder="Ex: Réception complète..." style={{ height: 70, resize: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Impact sur le stock :</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 400, cursor: "pointer" }}>
                  <input type="radio" name="stockAction" value="no" checked={stockAction === "no"} onChange={() => setStockAction("no")} />
                  Ne pas modifier le stock (phase de test)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 400, cursor: "pointer" }}>
                  <input type="radio" name="stockAction" value="yes" checked={stockAction === "yes"} onChange={() => setStockAction("yes")} />
                  Ajouter au stock de référence (session officielle)
                </label>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={() => setShowEndModal(false)}>Annuler</button>
              <button className="btn btn-danger" onClick={endSession}>■ Clôturer la session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

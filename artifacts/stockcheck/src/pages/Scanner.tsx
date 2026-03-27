import { useState, useEffect, useRef, useCallback } from "react";
import { Article, PackingItem, LogEntry, Session, Mode, DefectiveItem, DEFECT_TYPES } from "../types";
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
    defectiveInSession: DefectiveItem[];
  };
  onStateChange: (s: {
    currentSession: Session | null;
    packingList: PackingItem[];
    scanLog: LogEntry[];
    sessionScans: Record<string, number>;
    mode: Mode;
    defectiveInSession: DefectiveItem[];
  }) => void;
  markUnsaved: () => void;
  markSaved: () => void;
}

const MODES: { value: Mode; label: string }[] = [
  { value: "reception", label: "Réception" },
  { value: "retour", label: "Retour (packing)" },
  { value: "retour-libre", label: "Retour libre" },
  { value: "test", label: "Test" },
  { value: "inventaire", label: "Inventaire" },
];

function nowStr() {
  return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dateStr() {
  return new Date().toISOString();
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
  const [defectiveInSession, setDefectiveInSession] = useState<DefectiveItem[]>(savedState.defectiveInSession || []);
  const [scanFb, setScanFb] = useState<{ txt: string; type: string }>({ txt: "En attente de scan...", type: "" });

  // Modals
  const [showPackingModal, setShowPackingModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDefectModal, setShowDefectModal] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [showResetPackingConfirm, setShowResetPackingConfirm] = useState(false);
  const [showActivePackingWarn, setShowActivePackingWarn] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [stockAction, setStockAction] = useState<"no" | "yes">("no");
  const [endSessNote, setEndSessNote] = useState("");

  // Packing list inputs
  const [plSku, setPlSku] = useState("");
  const [plQte, setPlQte] = useState(1);
  const [plSuggestions, setPlSuggestions] = useState<Article[]>([]);

  // Defect modal state
  const [defectSku, setDefectSku] = useState("");
  const [defectNom, setDefectNom] = useState("");
  const [defectCat, setDefectCat] = useState("");
  const [defectTaille, setDefectTaille] = useState("");
  const [defectType, setDefectType] = useState(DEFECT_TYPES[0]);
  const [defectNote, setDefectNote] = useState("");
  const [defectImageUrl, setDefectImageUrl] = useState("");

  // Last scan for defect marking
  const [lastScanSku, setLastScanSku] = useState("");

  const scanInputRef = useRef<HTMLInputElement>(null);
  const skuMap = useRef<Record<string, Article>>({});

  useEffect(() => {
    const map: Record<string, Article> = {};
    catalogue.forEach(a => { map[a.sku] = a; });
    skuMap.current = map;
  }, [catalogue]);

  const getState = useCallback(() => ({
    currentSession, packingList, scanLog, sessionScans, mode, defectiveInSession
  }), [currentSession, packingList, scanLog, sessionScans, mode, defectiveInSession]);

  // Auto-save state
  useEffect(() => {
    const state = getState();
    onStateChange(state);
    api.saveState(state).then(markSaved).catch(() => markUnsaved());
  }, [currentSession, packingList, scanLog, sessionScans, mode, defectiveInSession]);

  // Keep focus on scan input
  useEffect(() => {
    const handler = () => setTimeout(() => scanInputRef.current?.focus(), 100);
    document.addEventListener("click", handler);
    scanInputRef.current?.focus();
    return () => document.removeEventListener("click", handler);
  }, []);

  const addLog = useCallback((txt: string, icon: string, type: LogEntry["type"]) => {
    const entry: LogEntry = { time: nowStr(), icon, txt, type };
    setScanLog(prev => [entry, ...prev].slice(0, 200));
  }, []);

  const showFeedback = useCallback((txt: string, type: string) => {
    setScanFb({ txt, type });
  }, []);

  const handleScan = useCallback(async (raw: string) => {
    const sku = raw.trim();
    if (!sku) return;
    if (!currentSession) {
      showFeedback("⚠ Démarrez une session d'abord", "warn");
      return;
    }
    setLastScanSku(sku);
    const article = skuMap.current[sku];
    const newScans = { ...sessionScans, [sku]: (sessionScans[sku] || 0) + 1 };
    setSessionScans(newScans);

    if (!article) {
      addLog(`SKU inconnu: ${sku}`, "❓", "warn");
      showFeedback(`❓ SKU inconnu: ${sku}`, "warn");
      return;
    }

    const packItem = packingList.find(p => p.sku === sku);
    const scanned = newScans[sku];

    if (packItem) {
      const diff = scanned - packItem.qte;
      if (diff < 0) {
        addLog(`${article.nom} (${article.taille}) — ${scanned}/${packItem.qte}`, "📦", "ok");
        showFeedback(`✓ ${article.nom} — ${scanned}/${packItem.qte}`, "ok");
      } else if (diff === 0) {
        addLog(`${article.nom} (${article.taille}) — COMPLET ✓`, "✅", "ok");
        showFeedback(`✅ COMPLET — ${article.nom}`, "ok");
      } else {
        addLog(`${article.nom} (${article.taille}) — SURPLUS +${diff}`, "⚠️", "warn");
        showFeedback(`⚠️ SURPLUS +${diff} — ${article.nom}`, "warn");
      }
    } else if (packingList.length > 0) {
      addLog(`${article.nom} (${article.taille}) — Non prévu dans packing`, "🔶", "warn");
      showFeedback(`🔶 Inattendu — ${article.nom}`, "warn");
    } else {
      addLog(`${article.nom} (${article.taille}) — x${scanned}`, "✓", "ok");
      showFeedback(`✓ ${article.nom} (${article.taille})`, "ok");
    }
  }, [currentSession, sessionScans, packingList, addLog, showFeedback]);

  const handleMarkDefective = () => {
    if (!lastScanSku) return;
    const article = skuMap.current[lastScanSku];
    setDefectSku(lastScanSku);
    setDefectNom(article?.nom || lastScanSku);
    setDefectCat(article?.cat || "");
    setDefectTaille(article?.taille || "");
    setDefectType(DEFECT_TYPES[0]);
    setDefectNote("");
    setDefectImageUrl("");
    setShowDefectModal(true);
  };

  const confirmDefect = async () => {
    // Remove 1 from session scans (defective = counted but NOT added to stock)
    const defItem: DefectiveItem = {
      sessionId: currentSession?.id,
      sku: defectSku,
      nom: defectNom,
      cat: defectCat,
      taille: defectTaille,
      defectType,
      note: defectNote,
      imageUrl: defectImageUrl,
      source: mode,
      date: dateStr(),
      quantity: 1,
    };
    // Save to DB
    try {
      await api.addDefective(defItem);
    } catch (e) {
      console.error("Error saving defective", e);
    }
    setDefectiveInSession(prev => [...prev, defItem]);
    addLog(`⚠ Défectueux: ${defectNom} — ${defectType}`, "🔴", "err");
    showFeedback(`🔴 Défectueux enregistré — ${defectNom}`, "err");
    setShowDefectModal(false);
    setLastScanSku("");
  };

  const startSession = () => {
    if (!sessName.trim()) { alert("Entrez un nom de session."); return; }
    if (packingList.length > 0 && mode !== "retour-libre") {
      // Warn that a packing list is active
      setShowActivePackingWarn(true);
      return;
    }
    doStartSession();
  };

  const doStartSession = () => {
    setShowActivePackingWarn(false);
    const sess: Session = {
      id: String(Date.now()),
      name: sessName.trim(),
      type: sessType,
      mode,
      shop: shopInput.trim(),
      packing: [...packingList],
      startDate: dateStr(),
      endDate: null,
      note: "",
      stockAdded: false,
      scans: {},
      log: [],
      defectiveItems: [],
    };
    setCurrentSession(sess);
    setSessionScans({});
    setScanLog([]);
    setDefectiveInSession([]);
    setLastScanSku("");
    addLog(`Session démarrée: ${sess.name}`, "▶", "info");
    showFeedback(`▶ Session "${sess.name}" démarrée`, "ok");
    scanInputRef.current?.focus();
  };

  const openEndModal = () => {
    setStockAction("no");
    setEndSessNote("");
    setShowEndModal(true);
  };

  const endSession = async () => {
    if (!currentSession) return;
    const finishedSession: Session = {
      ...currentSession,
      packing: packingList,
      endDate: dateStr(),
      note: endSessNote,
      stockAdded: stockAction === "yes",
      scans: sessionScans,
      log: scanLog,
      defectiveItems: defectiveInSession,
    };
    try {
      await api.saveSession(finishedSession);
      setSessions([finishedSession, ...sessions.filter(s => s.id !== finishedSession.id)]);
    } catch (e) {
      console.error("Error saving session", e);
    }
    setShowEndModal(false);
    setShowSessionSummary(true);
    setCurrentSession(null);
    setSessionScans({});
    setScanLog([]);
    setDefectiveInSession([]);
    setLastScanSku("");
  };

  const confirmDeleteSession = async () => {
    if (!deleteTarget) return;
    await api.deleteSession(deleteTarget.id);
    setSessions(sessions.filter(s => s.id !== deleteTarget.id));
    setDeleteTarget(null);
    setShowDeleteModal(false);
  };

  const resetPackingList = () => {
    setPackingList([]);
    setShowResetPackingConfirm(false);
  };

  // Packing list management
  const addPackingItem = () => {
    const art = Object.values(skuMap.current).find(a => a.sku === plSku) || plSuggestions[0];
    if (!art) { alert("SKU introuvable"); return; }
    const exists = packingList.find(p => p.sku === art.sku);
    if (exists) {
      setPackingList(packingList.map(p => p.sku === art.sku ? { ...p, qte: p.qte + plQte } : p));
    } else {
      setPackingList([...packingList, { sku: art.sku, qte: plQte, nom: art.nom, taille: art.taille }]);
    }
    setPlSku("");
    setPlQte(1);
    setPlSuggestions([]);
  };

  const handlePlSkuChange = (val: string) => {
    setPlSku(val);
    if (val.length > 1) {
      const lower = val.toLowerCase();
      setPlSuggestions(catalogue.filter(a =>
        a.sku.toLowerCase().includes(lower) || a.nom.toLowerCase().includes(lower)
      ).slice(0, 6));
    } else {
      setPlSuggestions([]);
    }
  };

  // Build live table rows with separate pos/neg variance
  const liveRows = (() => {
    const rows: { sku: string; nom: string; taille: string; cat: string; scanned: number; expected: number | null; ecartPos: number; ecartNeg: number; type: "ok" | "manquant" | "surplus" | "inconnu" }[] = [];
    const skusDone = new Set<string>();
    packingList.forEach(pl => {
      const scanned = sessionScans[pl.sku] || 0;
      const diff = scanned - pl.qte;
      const art = skuMap.current[pl.sku];
      rows.push({
        sku: pl.sku, nom: art?.nom || pl.nom, taille: art?.taille || pl.taille, cat: art?.cat || "",
        scanned, expected: pl.qte,
        ecartPos: diff > 0 ? diff : 0,
        ecartNeg: diff < 0 ? diff : 0,
        type: diff === 0 ? "ok" : diff > 0 ? "surplus" : "manquant",
      });
      skusDone.add(pl.sku);
    });
    Object.entries(sessionScans).forEach(([sku, cnt]) => {
      if (skusDone.has(sku)) return;
      const art = skuMap.current[sku];
      rows.push({ sku, nom: art?.nom || sku, taille: art?.taille || "—", cat: art?.cat || "", scanned: cnt, expected: null, ecartPos: 0, ecartNeg: 0, type: "inconnu" });
    });
    return rows;
  })();

  const defectiveSkus = new Set(defectiveInSession.map(d => d.sku));
  const totalScanned = Object.values(sessionScans).reduce((a, b) => a + b, 0);
  const totalDefective = defectiveInSession.length;
  const totalExpected = packingList.reduce((s, p) => s + p.qte, 0);

  // Build summary for ended session
  const [lastEndedSession, setLastEndedSession] = useState<Session | null>(null);
  const handleCloseSummary = () => {
    setShowSessionSummary(false);
    setLastEndedSession(null);
  };

  const sessionRunning = !!currentSession;

  return (
    <div className="scanner-page">
      {/* ── PACKING LIST (always prominent) ─────────────────────────── */}
      {(packingList.length > 0 || showPackingModal) && !currentSession && (
        <div className="packing-banner">
          <div className="packing-banner-header">
            <strong>📋 Packing List active ({packingList.length} référence{packingList.length > 1 ? "s" : ""}, {packingList.reduce((s, p) => s + p.qte, 0)} pcs)</strong>
            <div className="packing-banner-actions">
              <button className="btn btn-sm btn-outline" onClick={() => setShowPackingModal(true)}>Modifier</button>
              <button className="btn btn-sm btn-danger" onClick={() => setShowResetPackingConfirm(true)}>🗑 Réinitialiser</button>
            </div>
          </div>
          <div className="packing-mini-list">
            {packingList.slice(0, 5).map(p => (
              <span key={p.sku} className="packing-mini-item">{p.nom} {p.taille} ×{p.qte}</span>
            ))}
            {packingList.length > 5 && <span className="packing-mini-item muted">+{packingList.length - 5} autres</span>}
          </div>
        </div>
      )}

      <div className="scanner-layout">
        {/* LEFT PANEL: Setup + scan */}
        <div className="scanner-left">
          {/* Session setup */}
          {!sessionRunning ? (
            <div className="card">
              <div className="card-title">Nouvelle session</div>
              <div className="form-row">
                <label>Mode</label>
                <select value={mode} onChange={e => setMode(e.target.value as Mode)}>
                  {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Nom de session</label>
                <input value={sessName} onChange={e => setSessName(e.target.value)} placeholder="ex: Réception Paris 2025-01" />
              </div>
              <div className="form-row">
                <label>Type</label>
                <select value={sessType} onChange={e => setSessType(e.target.value)}>
                  <option value="officielle">Officielle</option>
                  <option value="test">Test</option>
                  <option value="inventaire">Inventaire</option>
                  <option value="retour">Retour</option>
                </select>
              </div>
              <div className="form-row">
                <label>Boutique / Lieu</label>
                <input value={shopInput} onChange={e => setShopInput(e.target.value)} placeholder="ex: Entrepôt Paris" />
              </div>
              {(mode === "reception" || mode === "retour" || mode === "inventaire") && (
                <button className="btn btn-outline btn-sm mt-sm" onClick={() => setShowPackingModal(true)}>
                  📋 {packingList.length > 0 ? `Modifier packing list (${packingList.length} réf.)` : "Configurer packing list"}
                </button>
              )}
              <button className="btn btn-primary mt-sm" style={{ width: "100%" }} onClick={startSession}>
                ▶ Démarrer la session
              </button>
            </div>
          ) : (
            <div className="card session-active-card">
              <div className="session-active-header">
                <div>
                  <div className="session-active-name">{currentSession.name}</div>
                  <div className="session-active-meta">
                    <span className="badge badge-blue">{MODES.find(m => m.value === currentSession.mode)?.label}</span>
                    {currentSession.shop && <span className="badge badge-gray">{currentSession.shop}</span>}
                  </div>
                </div>
                <div className="session-counters">
                  <div className="counter-chip"><span>{totalScanned}</span><small>scannés</small></div>
                  {totalExpected > 0 && <div className="counter-chip"><span>{totalExpected}</span><small>attendus</small></div>}
                  {totalDefective > 0 && <div className="counter-chip counter-red"><span>{totalDefective}</span><small>défectueux</small></div>}
                </div>
              </div>

              {/* Scan input */}
              <div className="scan-input-block">
                <input
                  ref={scanInputRef}
                  className="scan-input"
                  placeholder="Scanner un code SKU..."
                  autoComplete="off"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value;
                      (e.target as HTMLInputElement).value = "";
                      handleScan(val);
                    }
                  }}
                />
              </div>

              {/* Feedback */}
              <div className={`scan-feedback scan-feedback-${scanFb.type}`}>
                {scanFb.txt}
              </div>

              {/* Mark defective button */}
              {lastScanSku && (
                <button className="btn btn-danger btn-sm mark-defective-btn" onClick={handleMarkDefective}>
                  🔴 Marquer comme défectueux ({lastScanSku})
                </button>
              )}

              <div className="session-actions">
                <button className="btn btn-outline btn-sm" onClick={() => setShowDeleteModal(true)}>🗑 Annuler session</button>
                <button className="btn btn-warning btn-sm" onClick={openEndModal}>⏹ Terminer session</button>
              </div>
            </div>
          )}

          {/* Log */}
          <div className="card log-card">
            <div className="card-title">Journal de scan</div>
            <div className="log-list">
              {scanLog.length === 0 ? (
                <div className="muted text-center">Aucun scan enregistré</div>
              ) : scanLog.map((l, i) => (
                <div key={i} className={`log-entry log-${l.type}`}>
                  <span className="log-time">{l.time}</span>
                  <span className="log-icon">{l.icon}</span>
                  <span className="log-txt">{l.txt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Live tracking */}
        <div className="scanner-right">
          <div className="card" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Suivi en temps réel</span>
              <span className="badge badge-blue">{liveRows.length} réf.</span>
            </div>

            {liveRows.length === 0 ? (
              <div className="muted text-center" style={{ padding: "2rem" }}>Aucun scan dans cette session</div>
            ) : (
              <div className="live-table-wrap">
                <table className="live-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Produit</th>
                      <th>Taille</th>
                      <th>Scanné</th>
                      <th>Attendu</th>
                      <th>Écart +</th>
                      <th>Écart −</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveRows.map(r => (
                      <tr key={r.sku} className={`row-${r.type}${defectiveSkus.has(r.sku) ? " row-defective" : ""}`}>
                        <td className="mono">{r.sku}</td>
                        <td>{r.nom}</td>
                        <td>{r.taille}</td>
                        <td className="num">{r.scanned}</td>
                        <td className="num">{r.expected ?? "—"}</td>
                        <td className="num ecart-pos">{r.ecartPos > 0 ? `+${r.ecartPos}` : "—"}</td>
                        <td className="num ecart-neg">{r.ecartNeg < 0 ? `${r.ecartNeg}` : "—"}</td>
                        <td>
                          {defectiveSkus.has(r.sku) ? <span className="badge badge-red">Défectueux</span> :
                            r.type === "ok" ? <span className="badge badge-green">Conforme</span> :
                            r.type === "surplus" ? <span className="badge badge-orange">Surplus</span> :
                            r.type === "manquant" ? <span className="badge badge-red">Manquant</span> :
                            <span className="badge badge-gray">Inconnu</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Packing list quick view during session */}
          {sessionRunning && packingList.length > 0 && (
            <div className="card packing-session-card">
              <div className="card-title">Packing List</div>
              <div className="packing-progress-list">
                {packingList.map(p => {
                  const scanned = sessionScans[p.sku] || 0;
                  const pct = Math.min((scanned / p.qte) * 100, 100);
                  const diff = scanned - p.qte;
                  return (
                    <div key={p.sku} className="packing-progress-item">
                      <div className="packing-progress-header">
                        <span>{p.nom} {p.taille}</span>
                        <span className={diff > 0 ? "ecart-pos" : diff < 0 ? "ecart-neg" : "ecart-ok"}>
                          {scanned}/{p.qte}
                          {diff > 0 && <> <span className="ecart-pos">+{diff}</span></>}
                          {diff < 0 && <> <span className="ecart-neg">{diff}</span></>}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: diff > 0 ? "var(--orange)" : diff === 0 && scanned > 0 ? "var(--green)" : "var(--blue)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PACKING LIST MODAL ────────────────────────────────────────── */}
      {showPackingModal && (
        <div className="modal-overlay" onClick={() => setShowPackingModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Packing List</h3>
              <button className="modal-close" onClick={() => setShowPackingModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="pl-add-row">
                <div style={{ position: "relative", flex: 2 }}>
                  <input
                    value={plSku}
                    onChange={e => handlePlSkuChange(e.target.value)}
                    placeholder="SKU ou nom article..."
                    style={{ width: "100%" }}
                  />
                  {plSuggestions.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {plSuggestions.map(a => (
                        <div key={a.sku} className="autocomplete-item" onClick={() => { setPlSku(a.sku); setPlSuggestions([]); }}>
                          <span className="mono">{a.sku}</span> — {a.nom} {a.taille}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input type="number" min={1} value={plQte} onChange={e => setPlQte(parseInt(e.target.value) || 1)} style={{ width: 70 }} />
                <button className="btn btn-primary btn-sm" onClick={addPackingItem}>+ Ajouter</button>
              </div>
              <div className="pl-list">
                {packingList.length === 0 ? (
                  <div className="muted text-center" style={{ padding: "1rem" }}>Aucune référence ajoutée</div>
                ) : (
                  <table style={{ width: "100%" }}>
                    <thead><tr><th>SKU</th><th>Produit</th><th>Taille</th><th>Qté</th><th></th></tr></thead>
                    <tbody>
                      {packingList.map(p => (
                        <tr key={p.sku}>
                          <td className="mono">{p.sku}</td>
                          <td>{p.nom}</td>
                          <td>{p.taille}</td>
                          <td>
                            <input type="number" min={1} value={p.qte} style={{ width: 60 }}
                              onChange={e => setPackingList(packingList.map(x => x.sku === p.sku ? { ...x, qte: parseInt(e.target.value) || 1 } : x))} />
                          </td>
                          <td><button className="btn btn-danger btn-sm" onClick={() => setPackingList(packingList.filter(x => x.sku !== p.sku))}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {packingList.length > 0 && (
                <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between" }}>
                  <button className="btn btn-danger btn-sm" onClick={() => setShowResetPackingConfirm(true)}>🗑 Tout effacer</button>
                  <button className="btn btn-primary" onClick={() => setShowPackingModal(false)}>✓ Confirmer</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── RESET PACKING CONFIRM ────────────────────────────────────── */}
      {showResetPackingConfirm && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header"><h3>Réinitialiser la packing list ?</h3></div>
            <div className="modal-body">
              <p>Cette action supprimera toutes les références de la packing list actuelle.</p>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setShowResetPackingConfirm(false)}>Annuler</button>
                <button className="btn btn-danger" onClick={resetPackingList}>🗑 Réinitialiser</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVE PACKING WARN ──────────────────────────────────────── */}
      {showActivePackingWarn && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header"><h3>⚠️ Packing list déjà active</h3></div>
            <div className="modal-body">
              <p>Une packing list est déjà configurée ({packingList.length} références). Voulez-vous la réinitialiser avant de démarrer la session ?</p>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => { setShowActivePackingWarn(false); doStartSession(); }}>Conserver et démarrer</button>
                <button className="btn btn-warning" onClick={() => { resetPackingList(); doStartSession(); }}>Réinitialiser et démarrer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DEFECT MODAL ─────────────────────────────────────────────── */}
      {showDefectModal && (
        <div className="modal-overlay" onClick={() => setShowDefectModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔴 Article défectueux</h3>
              <button className="modal-close" onClick={() => setShowDefectModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p><strong>{defectNom}</strong> — SKU: <code>{defectSku}</code></p>
              <div className="form-row">
                <label>Type de défaut *</label>
                <select value={defectType} onChange={e => setDefectType(e.target.value)}>
                  {DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Note (optionnel)</label>
                <textarea value={defectNote} onChange={e => setDefectNote(e.target.value)} rows={2} placeholder="Description du défaut..." />
              </div>
              <div className="form-row">
                <label>URL image (optionnel)</label>
                <input value={defectImageUrl} onChange={e => setDefectImageUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setShowDefectModal(false)}>Annuler</button>
                <button className="btn btn-danger" onClick={confirmDefect}>🔴 Confirmer défectueux</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── END SESSION MODAL ────────────────────────────────────────── */}
      {showEndModal && (
        <div className="modal-overlay" onClick={() => setShowEndModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⏹ Terminer la session</h3>
              <button className="modal-close" onClick={() => setShowEndModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="summary-stats">
                <div className="stat-box"><span>{totalScanned}</span><small>Total scanné</small></div>
                {totalExpected > 0 && <div className="stat-box"><span>{totalExpected}</span><small>Attendus</small></div>}
                {totalDefective > 0 && <div className="stat-box stat-red"><span>{totalDefective}</span><small>Défectueux</small></div>}
                <div className="stat-box stat-green"><span>{totalScanned - totalDefective}</span><small>Conformes</small></div>
              </div>
              <div className="form-row">
                <label>Note de clôture</label>
                <textarea value={endSessNote} onChange={e => setEndSessNote(e.target.value)} rows={2} placeholder="Remarques..." />
              </div>
              <div className="form-row">
                <label>Ajouter au stock ?</label>
                <div className="radio-group">
                  <label><input type="radio" value="no" checked={stockAction === "no"} onChange={() => setStockAction("no")} /> Non</label>
                  <label><input type="radio" value="yes" checked={stockAction === "yes"} onChange={() => setStockAction("yes")} /> Oui</label>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setShowEndModal(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={endSession}>✓ Terminer et sauvegarder</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SESSION SUMMARY ──────────────────────────────────────────── */}
      {showSessionSummary && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>✅ Session terminée</h3>
            </div>
            <div className="modal-body">
              <div className="summary-stats">
                <div className="stat-box stat-green"><span>{totalScanned}</span><small>Total scanné</small></div>
                <div className="stat-box stat-red"><span>{totalDefective}</span><small>Défectueux</small></div>
                <div className="stat-box stat-green"><span>{totalScanned - totalDefective}</span><small>Conformes</small></div>
              </div>
              <p className="muted mt-sm">La session a été sauvegardée. Consultez l'onglet Sessions pour les détails.</p>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={handleCloseSummary}>✓ Fermer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE SESSION CONFIRM ───────────────────────────────────── */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header"><h3>Annuler la session ?</h3></div>
            <div className="modal-body">
              <p>Tous les scans de la session en cours seront perdus.</p>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setShowDeleteModal(false)}>Annuler</button>
                <button className="btn btn-danger" onClick={() => {
                  setCurrentSession(null); setSessionScans({}); setScanLog([]); setDefectiveInSession([]); setLastScanSku(""); setShowDeleteModal(false);
                }}>🗑 Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

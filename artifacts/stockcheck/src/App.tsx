import { useState, useEffect, useCallback } from "react";
import { Article, Session, PackingItem, LogEntry, Mode } from "./types";
import { api } from "./api";
import Scanner from "./pages/Scanner";
import Sessions from "./pages/Sessions";
import Catalogue from "./pages/Catalogue";
import Stock from "./pages/Stock";

type Page = "scan" | "sessions" | "catalogue" | "stock";

export default function App() {
  const [page, setPage] = useState<Page>("scan");
  const [catalogue, setCatalogue] = useState<Article[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "loading">("loading");
  const [savedState, setSavedState] = useState({
    currentSession: null as Session | null,
    packingList: [] as PackingItem[],
    scanLog: [] as LogEntry[],
    sessionScans: {} as Record<string, number>,
    mode: "reception" as Mode,
  });

  useEffect(() => {
    (async () => {
      try {
        const [catalogueData, sessionsData, appState] = await Promise.all([
          api.getCatalogue(),
          api.getSessions(),
          api.getState(),
        ]);
        setCatalogue(catalogueData);
        setSessions(sessionsData);
        setSavedState({
          currentSession: appState.currentSession || null,
          packingList: appState.packingList || [],
          scanLog: appState.scanLog || [],
          sessionScans: appState.sessionScans || {},
          mode: appState.mode || "reception",
        });
        setSaveStatus("saved");
      } catch (e) {
        console.error("Load error", e);
        setSaveStatus("saved");
      }
    })();
  }, []);

  const markUnsaved = useCallback(() => setSaveStatus("unsaved"), []);
  const markSaved = useCallback(() => setSaveStatus("saved"), []);

  const handleStateChange = useCallback((state: typeof savedState) => {
    setSavedState(state);
  }, []);

  const saveManual = async () => {
    try {
      await api.saveState(savedState);
      setSaveStatus("saved");
      alert("✓ Données sauvegardées avec succès.");
    } catch (e) {
      console.error("Save error", e);
    }
  };

  const exportExcel = () => {
    if (sessions.length === 0) { alert("Aucune session à exporter."); return; }
    const a = document.createElement("a");
    a.href = api.exportSessionUrl(sessions[0].id);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Auto-save every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (saveStatus === "unsaved") {
        api.saveState(savedState).then(markSaved).catch(console.error);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [saveStatus, savedState, markSaved]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "var(--sans)", background: "var(--bg)", color: "var(--text)", fontSize: 14, lineHeight: 1.5 }}>
      <nav className="nav">
        <div className="nav-brand">StockCheck <span>Outil de contrôle</span></div>
        {(["scan", "sessions", "catalogue", "stock"] as Page[]).map(p => (
          <button
            key={p}
            className={`ntab${page === p ? " active" : ""}`}
            onClick={() => setPage(p)}
          >
            {{ scan: "Scanner", sessions: "Sessions", catalogue: "Catalogue", stock: "Stock (réf.)" }[p]}
          </button>
        ))}
        <div className="nav-right">
          <div className="save-indicator">
            <div className={`save-dot${saveStatus === "unsaved" ? " unsaved" : ""}`} />
            <span>
              {saveStatus === "loading" ? "Chargement..." : saveStatus === "unsaved" ? "Non sauvegardé" : "Sauvegardé"}
            </span>
          </div>
          <button className="btn btn-outline btn-sm" onClick={saveManual}>💾 Sauvegarder</button>
          <button className="btn btn-outline btn-sm" onClick={exportExcel}>⬇ Export Excel</button>
        </div>
      </nav>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {page === "scan" && (
          <Scanner
            catalogue={catalogue}
            sessions={sessions}
            setSessions={setSessions}
            savedState={savedState}
            onStateChange={handleStateChange}
            markUnsaved={markUnsaved}
            markSaved={markSaved}
          />
        )}
        {page === "sessions" && (
          <Sessions
            sessions={sessions}
            setSessions={setSessions}
            catalogue={catalogue}
          />
        )}
        {page === "catalogue" && (
          <Catalogue
            catalogue={catalogue}
            setCatalogue={setCatalogue}
          />
        )}
        {page === "stock" && (
          <Stock catalogue={catalogue} />
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Article, Session, PackingItem, LogEntry, Mode, DefectiveItem } from "./types";
import { api } from "./api";
import Scanner from "./pages/Scanner";
import Sessions from "./pages/Sessions";
import Catalogue from "./pages/Catalogue";
import Stock from "./pages/Stock";
import Defective from "./pages/Defective";
import Settings from "./pages/Settings";

type Page = "scan" | "sessions" | "catalogue" | "stock" | "defective" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("scan");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [catalogue, setCatalogue] = useState<Article[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "loading">("loading");
  const [savedState, setSavedState] = useState({
    currentSession: null as Session | null,
    packingList: [] as PackingItem[],
    scanLog: [] as LogEntry[],
    sessionScans: {} as Record<string, number>,
    mode: "reception" as Mode,
    defectiveInSession: [] as DefectiveItem[],
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
          defectiveInSession: appState.defectiveInSession || [],
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

  useEffect(() => {
    const interval = setInterval(() => {
      if (saveStatus === "unsaved") {
        api.saveState(savedState).then(markSaved).catch(console.error);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [saveStatus, savedState, markSaved]);

  const navItems: { id: Page; label: string }[] = [
    { id: "scan", label: "Scanner" },
    { id: "sessions", label: "Sessions" },
    { id: "defective", label: "⚠ Défectueux" },
    { id: "catalogue", label: "Catalogue" },
    { id: "stock", label: "Stock (réf.)" },
    { id: "settings", label: "⚙ Paramètres" },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "var(--sans)", background: "var(--bg)", color: "var(--text)", fontSize: 14, lineHeight: 1.5 }}>
      <nav className="nav">
        <div className="nav-brand">StockCheck <span>Outil de contrôle</span></div>
        <div className="nav-tabs desktop-tabs">
          {navItems.map(n => (
            <button key={n.id} className={`ntab${page === n.id ? " active" : ""}`} onClick={() => setPage(n.id)}>
              {n.label}
            </button>
          ))}
        </div>
        <div className="nav-right">
          <div className="save-indicator">
            <div className={`save-dot${saveStatus === "unsaved" ? " unsaved" : ""}`} />
            <span>{saveStatus === "loading" ? "Chargement..." : saveStatus === "unsaved" ? "Non sauvegardé" : "Sauvegardé"}</span>
          </div>
          <button className="btn btn-outline btn-sm" onClick={saveManual}>💾 Sauvegarder</button>
        </div>
        <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>☰</button>
      </nav>
      {mobileMenuOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-nav-panel" onClick={e => e.stopPropagation()}>
            {navItems.map(n => (
              <button key={n.id} className={`mobile-nav-item${page === n.id ? " active" : ""}`}
                onClick={() => { setPage(n.id); setMobileMenuOpen(false); }}>
                {n.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
          <Sessions sessions={sessions} setSessions={setSessions} catalogue={catalogue} />
        )}
        {page === "defective" && <Defective />}
        {page === "catalogue" && <Catalogue catalogue={catalogue} setCatalogue={setCatalogue} />}
        {page === "stock" && <Stock catalogue={catalogue} />}
        {page === "settings" && <Settings />}
      </div>
    </div>
  );
}

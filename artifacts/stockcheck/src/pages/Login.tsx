import { useState, useEffect, useRef } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  onAuth: (token: string) => void;
}

export default function Login({ onAuth }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${BASE}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code }),
      });
      const data = await r.json();
      if (data.success) {
        onAuth(data.token);
      } else {
        setError("Code incorrect. Réessayez.");
        setShake(true);
        setCode("");
        setTimeout(() => setShake(false), 600);
        inputRef.current?.focus();
      }
    } catch {
      setError("Erreur de connexion au serveur.");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #1d4ed8 100%)",
      fontFamily: "var(--sans)",
    }}>
      <div style={{
        background: "white", borderRadius: 16, padding: "40px 36px", width: 360,
        maxWidth: "calc(100vw - 32px)", boxShadow: "0 25px 50px rgba(0,0,0,.25)",
        animation: shake ? "shake .5s" : undefined,
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 26,
          }}>🔒</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>StockCheck</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Entrez le code d'accès pour continuer</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <input
              ref={inputRef}
              type="password"
              value={code}
              onChange={e => { setCode(e.target.value); setError(""); }}
              placeholder="Code d'accès"
              autoComplete="current-password"
              style={{
                width: "100%", padding: "13px 16px", border: `2px solid ${error ? "#ef4444" : "#e2e8f0"}`,
                borderRadius: 10, fontSize: 16, fontFamily: "var(--mono)",
                outline: "none", textAlign: "center", letterSpacing: "0.2em",
                transition: "border-color .15s", background: error ? "#fef2f2" : "white",
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = "#2563eb"; }}
              onBlur={e => { if (!error) e.target.style.borderColor = "#e2e8f0"; }}
            />
          </div>

          {error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
              padding: "8px 12px", fontSize: 13, color: "#dc2626", marginBottom: 14, textAlign: "center",
            }}>
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!code.trim() || loading}
            style={{
              width: "100%", padding: "13px", background: loading ? "#93c5fd" : "#2563eb",
              color: "white", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600,
              cursor: code.trim() && !loading ? "pointer" : "not-allowed",
              transition: "background .15s", fontFamily: "var(--sans)",
            }}
          >
            {loading ? "Vérification..." : "→ Accéder à l'application"}
          </button>
        </form>

        <div style={{ marginTop: 20, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
          StockCheck — Outil de contrôle de stock
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}

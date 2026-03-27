import { useState } from "react";
import { Article } from "../types";

interface Props {
  catalogue: Article[];
}

const TAILLES = ["XS", "S", "M", "L", "XL", "XXL", "TU"];

export default function Stock({ catalogue }: Props) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [tailleFilter, setTailleFilter] = useState("");

  const categories = [...new Set(catalogue.map(a => a.cat))].sort();
  const seen = new Set<string>();
  const rows = catalogue.filter(a => {
    if (seen.has(a.sku)) return false;
    seen.add(a.sku);
    if (search && !a.sku.toLowerCase().includes(search.toLowerCase()) && !a.nom.toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter && a.cat !== catFilter) return false;
    if (tailleFilter && a.taille !== tailleFilter) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ background: "var(--orange-light)", border: "1px solid #fdba74", borderRadius: "var(--radius)", padding: "10px 14px", fontSize: 13, color: "var(--orange)", margin: "16px 20px 0", display: "flex", gap: 8, alignItems: "flex-start" }}>
        ⚠️ <div><strong>Données de référence uniquement.</strong> Cette vue affiche les niveaux de stock initiaux. Le stock n'est pas modifié automatiquement — c'est une référence pour les phases de test.</div>
      </div>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ width: 200 }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 150 }}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tailleFilter} onChange={e => setTailleFilter(e.target.value)} style={{ width: 120 }}>
          <option value="">Toutes tailles</option>
          {TAILLES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="spacer" />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{rows.length} références</span>
      </div>
      <div className="scroll">
        <table className="tbl">
          <thead><tr><th>Nom</th><th>SKU</th><th>Catégorie</th><th>Taille</th><th>Couleur</th><th>Stock initial</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Aucun article</td></tr>
              : rows.map(a => (
                <tr key={a.sku}>
                  <td>{a.nom}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{a.sku}</td>
                  <td><span className="badge badge-grey">{a.cat}</span></td>
                  <td><span className="badge badge-blue">{a.taille}</span></td>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>{a.couleur}</td>
                  <td style={{ fontWeight: 600, color: a.stock_initial === 0 ? "var(--red)" : a.stock_initial <= 2 ? "var(--orange)" : "var(--text)" }}>
                    {a.stock_initial}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { DefectiveItem } from "../types";
import { api } from "../api";

export default function Defective() {
  const [items, setItems] = useState<DefectiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  useEffect(() => {
    api.getDefective().then(data => { setItems(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = items.filter(d => {
    if (search && !d.nom.toLowerCase().includes(search.toLowerCase()) && !d.sku.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && d.defectType !== filterType) return false;
    if (filterSource && d.source !== filterSource) return false;
    return true;
  });

  const allDefectTypes = Array.from(new Set(items.map(d => d.defectType)));
  const allSources = Array.from(new Set(items.map(d => d.source)));

  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    await api.deleteDefective(deleteTarget);
    setItems(items.filter(d => d.id !== deleteTarget));
    setDeleteTarget(null);
  };

  const exportXlsx = () => {
    const a = document.createElement("a");
    a.href = api.exportDefectiveUrl();
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleString("fr-FR"); } catch { return d; }
  };

  if (loading) return <div className="page"><div className="empty-state">Chargement...</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>⚠️ Registre défectueux</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="search-input" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Tous les défauts</option>
            {allDefectTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}>
            <option value="">Toutes les sources</option>
            {allSources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={exportXlsx}>⬇ Export Excel</button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card"><strong>{items.length}</strong><small>Total défectueux</small></div>
        {allDefectTypes.map(t => (
          <div key={t} className="stat-card stat-card-red">
            <strong>{items.filter(d => d.defectType === t).length}</strong>
            <small>{t}</small>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">Aucun article défectueux enregistré</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>SKU</th>
                <th>Date</th>
                <th>Source</th>
                <th>Type défaut</th>
                <th>Qté</th>
                <th>Note</th>
                <th>Image</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id}>
                  <td><strong>{d.nom}</strong>{d.taille && <span className="muted"> {d.taille}</span>}</td>
                  <td className="mono">{d.sku}</td>
                  <td className="muted">{formatDate(d.date)}</td>
                  <td><span className="badge badge-gray">{d.source}</span></td>
                  <td><span className="badge badge-red">{d.defectType}</span></td>
                  <td className="num">{d.quantity}</td>
                  <td className="muted">{d.note || "—"}</td>
                  <td>
                    {d.imageUrl ? (
                      <a href={d.imageUrl} target="_blank" rel="noopener noreferrer" className="img-link">📷 Voir</a>
                    ) : "—"}
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(d.id!)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget !== null && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header"><h3>Supprimer cet article défectueux ?</h3></div>
            <div className="modal-body">
              <p>Cette action est irréversible.</p>
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

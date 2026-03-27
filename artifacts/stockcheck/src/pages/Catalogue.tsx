import { useState } from "react";
import { Article } from "../types";
import { api } from "../api";

interface Props {
  catalogue: Article[];
  setCatalogue: (catalogue: Article[]) => void;
}

const CATEGORIES = ["T-Shirt", "Veste", "Jean", "Zip", "Knit", "Waffle", "Hoodie", "Short", "Maillot", "Windbreaker", "Jersey", "Accessoire", "Autre"];
const TAILLES = ["XS", "S", "M", "L", "XL", "XXL", "TU"];

export default function Catalogue({ catalogue, setCatalogue }: Props) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ sku: string; nom: string } | null>(null);
  const [form, setForm] = useState({ nom: "", sku: "", cat: "", taille: "M", couleur: "", stock: 0 });

  const categories = [...new Set(catalogue.map(a => a.cat))].sort();

  const groups: Record<string, { nom: string; cat: string; variants: Article[] }> = {};
  catalogue.forEach(a => {
    if (search && !a.sku.toLowerCase().includes(search.toLowerCase()) && !a.nom.toLowerCase().includes(search.toLowerCase())) return;
    if (catFilter && a.cat !== catFilter) return;
    if (!groups[a.nom]) groups[a.nom] = { nom: a.nom, cat: a.cat, variants: [] };
    groups[a.nom].variants.push(a);
  });
  const nomList = Object.keys(groups).sort();

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addArticle = async () => {
    if (!form.nom || !form.sku || !form.cat) { alert("Nom, SKU et catégorie sont obligatoires."); return; }
    if (catalogue.find(a => a.sku === form.sku)) { alert("Ce SKU existe déjà."); return; }
    const article: Article = { sku: form.sku, nom: form.nom, cat: form.cat, taille: form.taille, couleur: form.couleur, stock_initial: form.stock };
    try {
      await api.addArticle(article);
      setCatalogue([...catalogue, article]);
      setShowAddModal(false);
      setForm({ nom: "", sku: "", cat: "", taille: "M", couleur: "", stock: 0 });
    } catch (e: any) {
      alert("Erreur lors de l'ajout : " + e.message);
    }
  };

  const confirmDelete = (sku: string, nom: string) => setDeleteTarget({ sku, nom });
  const doDelete = async () => {
    if (!deleteTarget) return;
    setCatalogue(catalogue.filter(a => a.sku !== deleteTarget.sku));
    setDeleteTarget(null);
    try { await api.deleteArticle(deleteTarget.sku); } catch (e) { console.error(e); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="cat-filters">
        <div className="toolbar-title">Catalogue</div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher nom ou SKU..." style={{ width: 220 }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 150 }}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ Ajouter un article</button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{nomList.length} articles · {catalogue.length} variantes</span>
      </div>
      <div className="scroll">
        <table className="tbl">
          <thead><tr><th>Article</th><th>Catégorie</th><th>Tailles disponibles</th><th>Variantes</th><th></th></tr></thead>
          <tbody>
            {nomList.length === 0
              ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Aucun article</td></tr>
              : nomList.map(nom => {
                const g = groups[nom];
                const sid = "cat_" + nom.replace(/[^a-zA-Z0-9]/g, "_");
                const tailles = g.variants.map(v => v.taille).join(" · ");
                const isOpen = openGroups.has(sid);
                return (
                  <>
                    <tr key={nom} className="cat-article-row" onClick={() => toggleGroup(sid)} style={{ cursor: "pointer" }}>
                      <td style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "var(--muted)", transition: "transform .2s", display: "inline-block", transform: isOpen ? "rotate(90deg)" : "" }}>▶</span>
                        {g.nom}
                      </td>
                      <td><span className="badge badge-grey">{g.cat}</span></td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{tailles}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{g.variants.length} taille{g.variants.length > 1 ? "s" : ""}</td>
                      <td></td>
                    </tr>
                    {isOpen && g.variants.map(v => (
                      <tr key={v.sku} style={{ background: "var(--surface2)" }}>
                        <td style={{ paddingLeft: 40, color: "var(--muted)", fontSize: 12 }}>↳</td>
                        <td><span className="badge badge-blue">{v.taille}</span></td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{v.sku}</td>
                        <td style={{ fontSize: 12, color: "var(--muted)" }}>{v.couleur}</td>
                        <td style={{ textAlign: "right" }}>
                          <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); confirmDelete(v.sku, v.nom); }}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })
            }
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="modal">
            <div className="modal-hd">
              <div className="modal-hd-title">Ajouter un article</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div><label>Nom de l'article</label><input type="text" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="ex: Flamingo Knit" /></div>
              <div><label>SKU</label><input type="text" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="ex: KNT-M-FLMO" /></div>
              <div>
                <label>Catégorie</label>
                <select value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
                  <option value="">Sélectionner...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>Taille</label>
                <select value={form.taille} onChange={e => setForm({ ...form, taille: e.target.value })}>
                  {TAILLES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label>Couleur (code)</label><input type="text" value={form.couleur} onChange={e => setForm({ ...form, couleur: e.target.value })} placeholder="ex: FLMO" /></div>
              <div><label>Stock initial</label><input type="number" value={form.stock} min={0} onChange={e => setForm({ ...form, stock: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={() => setShowAddModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={addArticle}>+ Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="modal" style={{ width: 380 }}>
            <div className="modal-hd"><div className="modal-hd-title">Confirmer la suppression</div></div>
            <div className="modal-body">
              <p style={{ color: "var(--text2)" }}>Supprimer l'article "{deleteTarget.nom}" (SKU: {deleteTarget.sku}) du catalogue ?</p>
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

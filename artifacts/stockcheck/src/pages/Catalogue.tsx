import { useState, useRef } from "react";
import { Article } from "../types";
import { api } from "../api";

interface Props {
  catalogue: Article[];
  setCatalogue: (catalogue: Article[]) => void;
}

const CATEGORIES = ["T-Shirt", "Veste", "Jean", "Zip", "Knit", "Waffle", "Hoodie", "Short", "Maillot", "Windbreaker", "Jersey", "Accessoire", "Autre"];
const TAILLES = ["XS", "S", "M", "L", "XL", "XXL", "TU"];

function parseCSV(text: string): Partial<Article>[] {
  const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const results: Partial<Article>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ""));
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => { obj[h] = cols[idx] || ""; });
    results.push({
      sku: obj["sku"] || obj["reference"] || obj["ref"] || "",
      nom: obj["nom"] || obj["name"] || obj["article"] || obj["produit"] || "",
      cat: obj["cat"] || obj["categorie"] || obj["category"] || "",
      taille: obj["taille"] || obj["size"] || "",
      couleur: obj["couleur"] || obj["color"] || obj["couleur"] || "",
      stock_initial: parseInt(obj["stock"] || obj["stock_initial"] || obj["stockinitial"] || "0") || 0,
    });
  }
  return results.filter(r => r.sku && r.nom);
}

export default function Catalogue({ catalogue, setCatalogue }: Props) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ sku: string; nom: string } | null>(null);
  const [form, setForm] = useState({ nom: "", sku: "", cat: "", taille: "M", couleur: "", stock: 0 });
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<Partial<Article>[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Export catalogue as CSV
  const exportCSV = () => {
    const header = "sku,nom,cat,taille,couleur,stock_initial";
    const rows = catalogue.map(a => `"${a.sku}","${a.nom}","${a.cat}","${a.taille}","${a.couleur}",${a.stock_initial}`);
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "catalogue.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download CSV template
  const downloadTemplate = () => {
    const content = `sku,nom,cat,taille,couleur,stock_initial\nKNT-M-FLMO,"Flamingo Knit",Knit,M,FLMO,10\nKNT-L-FLMO,"Flamingo Knit",Knit,L,FLMO,8`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "catalogue_modele.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportTextChange = (val: string) => {
    setImportText(val);
    setImportResult(null);
    if (val.trim()) {
      const parsed = parseCSV(val);
      setImportPreview(parsed);
    } else {
      setImportPreview([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      handleImportTextChange(text);
    };
    reader.readAsText(file, "UTF-8");
  };

  const doImport = async () => {
    if (!importPreview.length) return;
    setImporting(true);
    let ok = 0, skipped = 0;
    const newArticles = [...catalogue];
    for (const item of importPreview) {
      const article = item as Article;
      if (!article.sku || !article.nom || !article.cat) { skipped++; continue; }
      if (catalogue.find(a => a.sku === article.sku)) { skipped++; continue; }
      try {
        await api.addArticle(article);
        newArticles.push(article);
        ok++;
      } catch { skipped++; }
    }
    setCatalogue(newArticles);
    setImporting(false);
    setImportResult({ ok, skipped });
  };

  const closeImport = () => {
    setShowImportModal(false);
    setImportText("");
    setImportPreview([]);
    setImportResult(null);
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
        <button className="btn btn-outline btn-sm" onClick={() => setShowImportModal(true)}>⬆ Importer CSV</button>
        {catalogue.length > 0 && <button className="btn btn-outline btn-sm" onClick={exportCSV}>⬇ Exporter CSV</button>}
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ Ajouter un article</button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{nomList.length} articles · {catalogue.length} variantes</span>
      </div>

      {catalogue.length === 0 && (
        <div style={{ background: "var(--acc-light)", border: "1px solid #93c5fd", borderRadius: "var(--radius)", padding: "14px 20px", margin: "16px 20px 0", fontSize: 13, color: "var(--acc)" }}>
          💡 <strong>Catalogue vide.</strong> Ajoutez des articles un par un avec le bouton "+ Ajouter un article", ou importez un fichier CSV existant avec "⬆ Importer CSV".
        </div>
      )}

      <div className="scroll">
        <table className="tbl">
          <thead><tr><th>Article</th><th>Catégorie</th><th>Tailles disponibles</th><th>Variantes</th><th></th></tr></thead>
          <tbody>
            {nomList.length === 0
              ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Aucun article dans le catalogue</td></tr>
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

      {/* ── ADD MODAL ── */}
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

      {/* ── IMPORT CSV MODAL ── */}
      {showImportModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) closeImport(); }}>
          <div className="modal" style={{ width: 680 }}>
            <div className="modal-hd">
              <div className="modal-hd-title">⬆ Importer un catalogue CSV</div>
              <button className="btn btn-ghost btn-sm" onClick={closeImport}>✕</button>
            </div>
            <div className="modal-body" style={{ gap: 14 }}>

              {importResult ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{importResult.ok} article{importResult.ok > 1 ? "s" : ""} importé{importResult.ok > 1 ? "s" : ""}</div>
                  {importResult.skipped > 0 && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{importResult.skipped} ignoré{importResult.skipped > 1 ? "s" : ""} (SKU déjà existant ou données manquantes)</div>}
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={closeImport}>✓ Fermer</button>
                </div>
              ) : (
                <>
                  <div style={{ background: "var(--acc-light)", border: "1px solid #93c5fd", borderRadius: "var(--radius)", padding: "10px 14px", fontSize: 12, color: "var(--acc)" }}>
                    <strong>Format attendu :</strong> CSV avec colonnes <code>sku, nom, cat, taille, couleur, stock_initial</code><br />
                    Séparateur virgule ou point-virgule. Accepte aussi les colonnes <code>reference, article, categorie, size, color</code>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn btn-outline btn-sm" onClick={downloadTemplate}>⬇ Télécharger le modèle CSV</button>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>ou</span>
                    <button className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>📂 Choisir un fichier CSV</button>
                    <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleFileUpload} />
                  </div>

                  <div>
                    <label>Ou coller directement le contenu CSV ici :</label>
                    <textarea
                      value={importText}
                      onChange={e => handleImportTextChange(e.target.value)}
                      rows={8}
                      style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                      placeholder={`sku,nom,cat,taille,couleur,stock_initial\nKNT-M-FLMO,"Flamingo Knit",Knit,M,FLMO,10`}
                    />
                  </div>

                  {importPreview.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
                        Aperçu — {importPreview.length} article{importPreview.length > 1 ? "s" : ""} détecté{importPreview.length > 1 ? "s" : ""} :
                      </div>
                      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto", maxHeight: 220 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "var(--surface2)" }}>
                              <th style={{ padding: "6px 10px", textAlign: "left" }}>SKU</th>
                              <th style={{ padding: "6px 10px", textAlign: "left" }}>Nom</th>
                              <th style={{ padding: "6px 10px", textAlign: "left" }}>Catégorie</th>
                              <th style={{ padding: "6px 10px", textAlign: "left" }}>Taille</th>
                              <th style={{ padding: "6px 10px", textAlign: "left" }}>Couleur</th>
                              <th style={{ padding: "6px 10px", textAlign: "right" }}>Stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.map((item, i) => (
                              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                                <td style={{ padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11 }}>{item.sku}</td>
                                <td style={{ padding: "6px 10px" }}>{item.nom}</td>
                                <td style={{ padding: "6px 10px" }}>{item.cat || <span style={{ color: "var(--red)" }}>manquant</span>}</td>
                                <td style={{ padding: "6px 10px" }}>{item.taille}</td>
                                <td style={{ padding: "6px 10px" }}>{item.couleur}</td>
                                <td style={{ padding: "6px 10px", textAlign: "right" }}>{item.stock_initial ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            {!importResult && (
              <div className="modal-ft">
                <button className="btn btn-outline" onClick={closeImport}>Annuler</button>
                <button
                  className="btn btn-primary"
                  onClick={doImport}
                  disabled={!importPreview.length || importing}
                >
                  {importing ? "Import en cours..." : `⬆ Importer ${importPreview.length} article${importPreview.length > 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ── */}
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

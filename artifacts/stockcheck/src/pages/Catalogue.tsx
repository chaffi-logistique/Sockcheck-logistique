import { useState, useRef } from "react";
import { Article } from "../types";
import { api } from "../api";

interface Props {
  catalogue: Article[];
  setCatalogue: (catalogue: Article[]) => void;
}

const CATEGORIES = ["T-Shirt", "Veste", "Jean", "Zip", "Knit", "Waffle", "Hoodie", "Short", "Maillot", "Windbreaker", "Jersey", "Accessoire", "Autre"];
const TAILLES = ["XS", "S", "M", "L", "XL", "XXL", "TU"];

// ── CSV helpers ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === sep && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += c; }
  }
  result.push(current.trim());
  return result;
}

function detectSep(line: string): string {
  return (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ";" : ",";
}

/** Generic StockCheck CSV parser */
function parseStockCSV(text: string): Partial<Article>[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (!lines.length) return [];
  const sep = detectSep(lines[0]);
  const header = parseCSVLine(lines[0], sep).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const results: Partial<Article>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], sep);
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => { obj[h] = (cols[idx] || "").replace(/^["']|["']$/g, ""); });
    results.push({
      sku: obj["sku"] || obj["reference"] || obj["ref"] || "",
      nom: obj["nom"] || obj["name"] || obj["article"] || obj["produit"] || "",
      cat: obj["cat"] || obj["categorie"] || obj["category"] || "",
      taille: obj["taille"] || obj["size"] || "",
      couleur: obj["couleur"] || obj["color"] || "",
      stock_initial: parseInt(obj["stock"] || obj["stock_initial"] || obj["stockinitial"] || "0") || 0,
    });
  }
  return results.filter(r => r.sku && r.nom);
}

// ── Shopify CSV parser ─────────────────────────────────────────────────────────

interface ShopifyItem {
  sku: string;
  nom: string;
  cat: string;
  taille: string;
  couleur: string;
  stock_initial: number;
  prix: number;
  isNew?: boolean; // filled after diff with catalogue
}

function inferCategory(sku: string, handle: string): string {
  const prefix = sku.toUpperCase().split("-")[0];
  const h = handle.toLowerCase();
  if (prefix === "JKT" || h.includes("veste") || h.includes("jacket")) return "Veste";
  if (prefix === "JNS" || h.includes("jean")) return "Jean";
  if (prefix === "ZIP" || h.includes("zip")) return "Zip";
  if (prefix === "HOD" || h.includes("hoodie")) return "Hoodie";
  if (prefix === "KNT" || h.includes("knit")) return "Knit";
  if (prefix === "WFL" || h.includes("waffle")) return "Waffle";
  if (prefix === "SHT" || h.includes("short")) return "Short";
  if (prefix === "MLT" || h.includes("maillot")) return "Maillot";
  if (prefix === "WND" || h.includes("windbreaker")) return "Windbreaker";
  if (prefix === "JRS" || h.includes("jersey")) return "Jersey";
  if (prefix === "TEE" || h.includes("tee")) return "T-Shirt";
  if (prefix === "ACS" || prefix === "CLN" || h.includes("holder") || h.includes("calecon") || h.includes("accessoire")) return "Accessoire";
  return "Autre";
}

function normalizeSize(val: string): string {
  const v = val.trim().toUpperCase();
  if (["XS","S","M","L","XL","XXL","TU"].includes(v)) return v;
  if (!v || v === "DEFAULT TITLE" || v === "TAILLE UNIQUE") return "TU";
  return v || "TU";
}

function extractColor(sku: string): string {
  const parts = sku.split("-");
  return parts.length >= 3 ? parts.slice(2).join("-") : "";
}

function parseShopifyCSV(text: string): { items: ShopifyItem[]; skipped: number } {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return { items: [], skipped: 0 };

  const sep = detectSep(lines[0]);
  const rawHeader = parseCSVLine(lines[0], sep);
  const header = rawHeader.map(h => h.trim().replace(/^["']|["']$/g, ""));

  const idx = (names: string[]): number => {
    for (const n of names) {
      const i = header.findIndex(h => h.toLowerCase().trim() === n.toLowerCase());
      if (i !== -1) return i;
    }
    return -1;
  };

  const iHandle = idx(["Handle"]);
  const iTitle = idx(["Title"]);
  const iOption1Val = idx(["Option1 Value"]);
  const iSKU = idx(["Variant SKU"]);
  const iQty = idx(["Variant Inventory Qty"]);
  const iPrice = idx(["Variant Price"]);

  if (iSKU === -1) return { items: [], skipped: 0 };

  const handleTitles: Record<string, string> = {};
  const items: ShopifyItem[] = [];
  const skusSeen = new Set<string>();
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], sep);
    const get = (idx: number) => idx >= 0 ? (cols[idx] || "").replace(/^["']|["']$/g, "").trim() : "";

    const handle = get(iHandle);
    const title = get(iTitle);
    const sku = get(iSKU);
    const qty = parseInt(get(iQty)) || 0;
    const price = parseFloat(get(iPrice).replace(",", ".")) || 0;
    const optVal = get(iOption1Val);

    if (handle && title) handleTitles[handle] = title;
    if (!sku) { if (handle || title) skipped++; continue; }
    if (skusSeen.has(sku)) continue;
    skusSeen.add(sku);

    const nom = handleTitles[handle] || handle || sku;
    items.push({
      sku,
      nom,
      cat: inferCategory(sku, handle),
      taille: normalizeSize(optVal),
      couleur: extractColor(sku),
      stock_initial: qty,
      prix: price,
    });
  }

  return { items, skipped };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Catalogue({ catalogue, setCatalogue }: Props) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ nom: "", sku: "", cat: "", taille: "M", couleur: "", stock: 0 });

  // Generic CSV import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<Partial<Article>[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shopify import
  const [showShopifyModal, setShowShopifyModal] = useState(false);
  const [shopifyItems, setShopifyItems] = useState<ShopifyItem[]>([]);
  const [shopifySkipped, setShopifySkipped] = useState(0);
  const [shopifyImporting, setShopifyImporting] = useState(false);
  const [shopifyResult, setShopifyResult] = useState<{ imported: number; updated: number; skipped: number } | null>(null);
  const shopifyFileRef = useRef<HTMLInputElement>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ sku: string; nom: string } | null>(null);

  // ── Catalogue view ──────────────────────────────────────────────
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
    setOpenGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // ── Add article ────────────────────────────────────────────────
  const addArticle = async () => {
    if (!form.nom || !form.sku || !form.cat) { alert("Nom, SKU et catégorie sont obligatoires."); return; }
    if (catalogue.find(a => a.sku === form.sku)) { alert("Ce SKU existe déjà."); return; }
    const article: Article = { sku: form.sku, nom: form.nom, cat: form.cat, taille: form.taille, couleur: form.couleur, stock_initial: form.stock };
    try {
      await api.addArticle(article);
      setCatalogue([...catalogue, article]);
      setShowAddModal(false);
      setForm({ nom: "", sku: "", cat: "", taille: "M", couleur: "", stock: 0 });
    } catch (e: any) { alert("Erreur lors de l'ajout : " + e.message); }
  };

  // ── Delete ─────────────────────────────────────────────────────
  const confirmDelete = (sku: string, nom: string) => setDeleteTarget({ sku, nom });
  const doDelete = async () => {
    if (!deleteTarget) return;
    setCatalogue(catalogue.filter(a => a.sku !== deleteTarget.sku));
    setDeleteTarget(null);
    try { await api.deleteArticle(deleteTarget.sku); } catch (e) { console.error(e); }
  };

  // ── Export CSV ─────────────────────────────────────────────────
  const exportCSV = () => {
    const header = "sku,nom,cat,taille,couleur,stock_initial";
    const rows = catalogue.map(a => `"${a.sku}","${a.nom}","${a.cat}","${a.taille}","${a.couleur}",${a.stock_initial}`);
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "catalogue.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const content = `sku,nom,cat,taille,couleur,stock_initial\nKNT-M-FLMO,"Flamingo Knit",Knit,M,FLMO,10\nKNT-L-FLMO,"Flamingo Knit",Knit,L,FLMO,8`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "catalogue_modele.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ── Generic import ─────────────────────────────────────────────
  const handleImportTextChange = (val: string) => {
    setImportText(val); setImportResult(null);
    setImportPreview(val.trim() ? parseStockCSV(val) : []);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => handleImportTextChange(ev.target?.result as string);
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
      try { await api.addArticle(article); newArticles.push(article); ok++; } catch { skipped++; }
    }
    setCatalogue(newArticles); setImporting(false); setImportResult({ ok, skipped });
  };

  const closeImport = () => { setShowImportModal(false); setImportText(""); setImportPreview([]); setImportResult(null); };

  // ── Shopify import ─────────────────────────────────────────────
  const handleShopifyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const { items, skipped } = parseShopifyCSV(text);
      const existingSkus = new Set(catalogue.map(a => a.sku));
      const itemsWithDiff = items.map(it => ({ ...it, isNew: !existingSkus.has(it.sku) }));
      setShopifyItems(itemsWithDiff);
      setShopifySkipped(skipped);
      setShopifyResult(null);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const doShopifyImport = async () => {
    if (!shopifyItems.length) return;
    setShopifyImporting(true);
    try {
      const result = await api.importShopify(shopifyItems);
      setShopifyResult(result);
      // Refresh catalogue from server
      const fresh = await api.getCatalogue();
      setCatalogue(fresh);
    } catch (e: any) {
      alert("Erreur d'import : " + e.message);
    }
    setShopifyImporting(false);
  };

  const closeShopify = () => { setShowShopifyModal(false); setShopifyItems([]); setShopifySkipped(0); setShopifyResult(null); };

  const shopifyNew = shopifyItems.filter(i => i.isNew).length;
  const shopifyUpdate = shopifyItems.filter(i => !i.isNew).length;

  // ── Render ─────────────────────────────────────────────────────
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
        <button className="btn btn-outline btn-sm" style={{ borderColor: "#16a34a", color: "#16a34a" }} onClick={() => setShowShopifyModal(true)}>
          🛍 Importer CSV Shopify
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setShowImportModal(true)}>⬆ Importer CSV</button>
        {catalogue.length > 0 && <button className="btn btn-outline btn-sm" onClick={exportCSV}>⬇ Exporter CSV</button>}
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ Ajouter</button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{nomList.length} articles · {catalogue.length} variantes</span>
      </div>

      {catalogue.length === 0 && (
        <div style={{ background: "var(--acc-light)", border: "1px solid #93c5fd", borderRadius: "var(--radius)", padding: "14px 20px", margin: "16px 20px 0", fontSize: 13, color: "var(--acc)" }}>
          💡 <strong>Catalogue vide.</strong> Importez votre fichier Shopify avec le bouton "🛍 Importer CSV Shopify", ou ajoutez des articles manuellement.
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

      {/* ── SHOPIFY IMPORT MODAL ── */}
      {showShopifyModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) closeShopify(); }}>
          <div className="modal" style={{ width: 720 }}>
            <div className="modal-hd">
              <div className="modal-hd-title">🛍 Importer depuis Shopify (CSV export)</div>
              <button className="btn btn-ghost btn-sm" onClick={closeShopify}>✕</button>
            </div>
            <div className="modal-body" style={{ gap: 14 }}>

              {shopifyResult ? (
                /* ── Result screen ── */
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Import terminé</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
                    <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 24px", minWidth: 120 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>{shopifyResult.imported}</div>
                      <div style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>Nouveaux articles</div>
                    </div>
                    <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 10, padding: "14px 24px", minWidth: 120 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "#2563eb" }}>{shopifyResult.updated}</div>
                      <div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 600 }}>Stocks mis à jour</div>
                    </div>
                    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 24px", minWidth: 120 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--muted)" }}>{shopifyResult.skipped}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Ignorés (sans SKU)</div>
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={closeShopify}>✓ Fermer</button>
                </div>
              ) : shopifyItems.length === 0 ? (
                /* ── Upload screen ── */
                <>
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "var(--radius)", padding: "12px 16px", fontSize: 12, color: "#15803d" }}>
                    <strong>Format Shopify :</strong> exportez vos produits depuis Shopify Admin → Produits → Exporter. Le fichier s'appelle <code>products_export.csv</code>.<br />
                    Colonnes utilisées : <code>Handle, Title, Option1 Value, Variant SKU, Variant Inventory Qty, Variant Price</code><br />
                    Séparateur virgule <strong>ou</strong> point-virgule (format français) supporté.
                  </div>
                  <div style={{ border: "2px dashed #86efac", borderRadius: 12, padding: "32px 20px", textAlign: "center", background: "#f0fdf4", cursor: "pointer" }}
                    onClick={() => shopifyFileRef.current?.click()}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
                    <div style={{ fontWeight: 600, color: "#15803d", marginBottom: 4 }}>Choisir le fichier CSV Shopify</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>products_export.csv · Virgule ou point-virgule</div>
                    <input ref={shopifyFileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleShopifyFile} />
                  </div>
                  {shopifySkipped > 0 && (
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{shopifySkipped} ligne(s) ignorée(s) (sans SKU).</div>
                  )}
                </>
              ) : (
                /* ── Preview screen ── */
                <>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 16px", fontSize: 13 }}>
                      <strong style={{ color: "#16a34a" }}>{shopifyNew}</strong> <span style={{ color: "#15803d" }}>nouveau{shopifyNew > 1 ? "x" : ""}</span>
                    </div>
                    <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "8px 16px", fontSize: 13 }}>
                      <strong style={{ color: "#2563eb" }}>{shopifyUpdate}</strong> <span style={{ color: "#1d4ed8" }}>mise{shopifyUpdate > 1 ? "s" : ""} à jour (stock + prix)</span>
                    </div>
                    {shopifySkipped > 0 && (
                      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 13 }}>
                        <strong style={{ color: "var(--muted)" }}>{shopifySkipped}</strong> <span style={{ color: "var(--muted)" }}>ignoré{shopifySkipped > 1 ? "s" : ""} (sans SKU)</span>
                      </div>
                    )}
                    <button className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }} onClick={() => { setShopifyItems([]); shopifyFileRef.current && (shopifyFileRef.current.value = ""); }}>
                      ↩ Changer de fichier
                    </button>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto", maxHeight: 300 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--surface2)", position: "sticky", top: 0 }}>
                          <th style={{ padding: "7px 10px", textAlign: "left" }}>Statut</th>
                          <th style={{ padding: "7px 10px", textAlign: "left" }}>SKU</th>
                          <th style={{ padding: "7px 10px", textAlign: "left" }}>Nom</th>
                          <th style={{ padding: "7px 10px", textAlign: "left" }}>Cat.</th>
                          <th style={{ padding: "7px 10px", textAlign: "left" }}>Taille</th>
                          <th style={{ padding: "7px 10px", textAlign: "right" }}>Stock</th>
                          <th style={{ padding: "7px 10px", textAlign: "right" }}>Prix</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shopifyItems.map((item, i) => (
                          <tr key={i} style={{ borderTop: "1px solid var(--border)", background: item.isNew ? "#f0fdf4" : undefined }}>
                            <td style={{ padding: "6px 10px" }}>
                              {item.isNew
                                ? <span style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", background: "#dcfce7", padding: "2px 7px", borderRadius: 10 }}>NOUVEAU</span>
                                : <span style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", background: "#dbeafe", padding: "2px 7px", borderRadius: 10 }}>MAJ STOCK</span>
                              }
                            </td>
                            <td style={{ padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11 }}>{item.sku}</td>
                            <td style={{ padding: "6px 10px" }}>{item.nom}</td>
                            <td style={{ padding: "6px 10px" }}>{item.cat}</td>
                            <td style={{ padding: "6px 10px" }}>{item.taille}</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{item.stock_initial}</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--muted)" }}>{item.prix > 0 ? `${item.prix.toFixed(2)} €` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            {!shopifyResult && shopifyItems.length > 0 && (
              <div className="modal-ft">
                <button className="btn btn-outline" onClick={closeShopify}>Annuler</button>
                <button className="btn btn-primary" style={{ background: "#16a34a" }} onClick={doShopifyImport} disabled={shopifyImporting}>
                  {shopifyImporting ? "Import en cours..." : `🛍 Importer ${shopifyItems.length} variante${shopifyItems.length > 1 ? "s" : ""}`}
                </button>
              </div>
            )}
            {!shopifyResult && shopifyItems.length === 0 && (
              <div className="modal-ft">
                <button className="btn btn-outline" onClick={closeShopify}>Annuler</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── GENERIC CSV IMPORT MODAL ── */}
      {showImportModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) closeImport(); }}>
          <div className="modal" style={{ width: 680 }}>
            <div className="modal-hd">
              <div className="modal-hd-title">⬆ Importer un catalogue CSV (format StockCheck)</div>
              <button className="btn btn-ghost btn-sm" onClick={closeImport}>✕</button>
            </div>
            <div className="modal-body" style={{ gap: 14 }}>
              {importResult ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{importResult.ok} article{importResult.ok > 1 ? "s" : ""} importé{importResult.ok > 1 ? "s" : ""}</div>
                  {importResult.skipped > 0 && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{importResult.skipped} ignoré(s) (SKU existant ou données manquantes)</div>}
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={closeImport}>✓ Fermer</button>
                </div>
              ) : (
                <>
                  <div style={{ background: "var(--acc-light)", border: "1px solid #93c5fd", borderRadius: "var(--radius)", padding: "10px 14px", fontSize: 12, color: "var(--acc)" }}>
                    <strong>Format :</strong> colonnes <code>sku, nom, cat, taille, couleur, stock_initial</code> — virgule ou point-virgule.
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn btn-outline btn-sm" onClick={downloadTemplate}>⬇ Modèle CSV</button>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>ou</span>
                    <button className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>📂 Choisir un fichier</button>
                    <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleFileUpload} />
                  </div>
                  <div>
                    <label>Ou coller le CSV ici :</label>
                    <textarea value={importText} onChange={e => handleImportTextChange(e.target.value)} rows={6}
                      style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                      placeholder={`sku,nom,cat,taille,couleur,stock_initial\nKNT-M-FLMO,"Flamingo Knit",Knit,M,FLMO,10`} />
                  </div>
                  {importPreview.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>{importPreview.length} article{importPreview.length > 1 ? "s" : ""} détecté{importPreview.length > 1 ? "s" : ""} :</div>
                      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto", maxHeight: 200 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead><tr style={{ background: "var(--surface2)" }}>
                            <th style={{ padding: "6px 10px", textAlign: "left" }}>SKU</th>
                            <th style={{ padding: "6px 10px", textAlign: "left" }}>Nom</th>
                            <th style={{ padding: "6px 10px", textAlign: "left" }}>Cat.</th>
                            <th style={{ padding: "6px 10px", textAlign: "left" }}>Taille</th>
                            <th style={{ padding: "6px 10px", textAlign: "right" }}>Stock</th>
                          </tr></thead>
                          <tbody>
                            {importPreview.map((item, i) => (
                              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                                <td style={{ padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11 }}>{item.sku}</td>
                                <td style={{ padding: "6px 10px" }}>{item.nom}</td>
                                <td style={{ padding: "6px 10px" }}>{item.cat || <span style={{ color: "var(--red)" }}>manquant</span>}</td>
                                <td style={{ padding: "6px 10px" }}>{item.taille}</td>
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
                <button className="btn btn-primary" onClick={doImport} disabled={!importPreview.length || importing}>
                  {importing ? "Import en cours..." : `⬆ Importer ${importPreview.length} article${importPreview.length > 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
              <div><label>Catégorie</label>
                <select value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
                  <option value="">Sélectionner...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label>Taille</label>
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

      {/* ── DELETE CONFIRM ── */}
      {deleteTarget && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="modal" style={{ width: 380 }}>
            <div className="modal-hd"><div className="modal-hd-title">Confirmer la suppression</div></div>
            <div className="modal-body">
              <p style={{ color: "var(--text2)" }}>Supprimer "{deleteTarget.nom}" (SKU: {deleteTarget.sku}) ?</p>
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

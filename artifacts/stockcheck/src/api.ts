import { Article, Session, DefectiveItem } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export const api = {
  getCatalogue: (): Promise<Article[]> => apiFetch(`${BASE}/api/catalogue`),
  addArticle: (data: Omit<Article, "id">) =>
    apiFetch(`${BASE}/api/catalogue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  deleteArticle: (sku: string) =>
    apiFetch(`${BASE}/api/catalogue/${encodeURIComponent(sku)}`, { method: "DELETE" }),

  getSessions: (): Promise<Session[]> => apiFetch(`${BASE}/api/sessions`),
  saveSession: (s: Session) =>
    apiFetch(`${BASE}/api/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }),
  deleteSession: (id: string) =>
    apiFetch(`${BASE}/api/sessions/${id}`, { method: "DELETE" }),
  exportSessionUrl: (id: string) => `${BASE}/api/sessions/${id}/export`,

  getState: () => apiFetch(`${BASE}/api/state`),
  saveState: (data: object) =>
    apiFetch(`${BASE}/api/state`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),

  getDefective: (): Promise<DefectiveItem[]> => apiFetch(`${BASE}/api/defective`),
  addDefective: (d: DefectiveItem) =>
    apiFetch(`${BASE}/api/defective`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }),
  deleteDefective: (id: number) =>
    apiFetch(`${BASE}/api/defective/${id}`, { method: "DELETE" }),
  exportDefectiveUrl: () => `${BASE}/api/defective/export`,

  getSettings: () => apiFetch(`${BASE}/api/settings`),
  saveSettings: (data: object) =>
    apiFetch(`${BASE}/api/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),

  adjustShopifyStock: (sku: string, delta: number) =>
    apiFetch(`${BASE}/api/shopify/adjust-stock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku, delta }) }),

  importShopify: (items: object[]): Promise<{ imported: number; updated: number; skipped: number }> =>
    apiFetch(`${BASE}/api/catalogue/import-shopify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(items) }),
};

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  catalogueTable, sessionsTable, appStateTable,
  defectiveItemsTable, settingsTable
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

// ── CATALOGUE ──────────────────────────────────────────────────

router.get("/catalogue", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(catalogueTable);
    res.json(rows.map(r => ({
      sku: r.sku, nom: r.nom, cat: r.cat, taille: r.taille,
      couleur: r.couleur, stock_initial: r.stockInitial,
    })));
  } catch (e) {
    req.log.error(e, "Error fetching catalogue");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/catalogue", async (req: Request, res: Response) => {
  try {
    const { sku, nom, cat, taille, couleur = "", stock_initial = 0 } = req.body;
    if (!sku || !nom || !cat) { res.status(400).json({ error: "sku, nom, cat requis" }); return; }
    await db.insert(catalogueTable).values({ sku, nom, cat, taille, couleur, stockInitial: stock_initial });
    res.json({ success: true });
  } catch (e: any) {
    if (e.code === "23505") { res.status(409).json({ error: "SKU déjà existant" }); return; }
    req.log.error(e, "Error inserting catalogue");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/catalogue/:sku", async (req: Request, res: Response) => {
  try {
    await db.delete(catalogueTable).where(eq(catalogueTable.sku, req.params.sku));
    res.json({ success: true });
  } catch (e) {
    req.log.error(e, "Error deleting article");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── SESSIONS ──────────────────────────────────────────────────

router.get("/sessions", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.createdAt));
    res.json(rows.map(r => ({
      id: r.id, name: r.name, type: r.type, mode: r.mode, shop: r.shop,
      packing: r.packing, startDate: r.startDate, endDate: r.endDate,
      note: r.note, stockAdded: r.stockAdded, scans: r.scans, log: r.log,
      defectiveItems: r.defectiveItems || [],
    })));
  } catch (e) {
    req.log.error(e, "Error fetching sessions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sessions", async (req: Request, res: Response) => {
  try {
    const s = req.body;
    await db.insert(sessionsTable).values({
      id: String(s.id), name: s.name, type: s.type, mode: s.mode,
      shop: s.shop || "", packing: s.packing || [], startDate: s.startDate,
      endDate: s.endDate || null, note: s.note || "",
      stockAdded: s.stockAdded || false, scans: s.scans || {}, log: s.log || [],
      defectiveItems: s.defectiveItems || [],
    }).onConflictDoUpdate({
      target: sessionsTable.id,
      set: {
        name: s.name, type: s.type, mode: s.mode, shop: s.shop || "",
        packing: s.packing || [], startDate: s.startDate, endDate: s.endDate || null,
        note: s.note || "", stockAdded: s.stockAdded || false,
        scans: s.scans || {}, log: s.log || [], defectiveItems: s.defectiveItems || [],
      },
    });
    res.json({ success: true });
  } catch (e) {
    req.log.error(e, "Error saving session");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/sessions/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, req.params.id));
    res.json({ success: true });
  } catch (e) {
    req.log.error(e, "Error deleting session");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sessions/:id/export", async (req: Request, res: Response) => {
  try {
    const { default: ExcelJS } = await import("exceljs");
    const rows = await db.select().from(sessionsTable).where(eq(sessionsTable.id, req.params.id));
    if (!rows.length) { res.status(404).json({ error: "Session non trouvée" }); return; }
    const s = rows[0];
    const scans = (s.scans as Record<string, number>) || {};
    const catalogue = await db.select().from(catalogueTable);
    const skuMap: Record<string, typeof catalogue[0]> = {};
    catalogue.forEach(a => { skuMap[a.sku] = a; });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Scans");
    ws.columns = [
      { header: "SKU", key: "sku", width: 20 },
      { header: "Produit", key: "nom", width: 25 },
      { header: "Catégorie", key: "cat", width: 15 },
      { header: "Taille", key: "taille", width: 10 },
      { header: "Couleur", key: "couleur", width: 10 },
      { header: "Scanné", key: "scanned", width: 10 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const [sku, cnt] of Object.entries(scans)) {
      const a = skuMap[sku];
      ws.addRow({ sku, nom: a?.nom || "Inconnu", cat: a?.cat || "—", taille: a?.taille || "—", couleur: a?.couleur || "—", scanned: cnt });
    }
    const defItems = (s.defectiveItems as any[]) || [];
    if (defItems.length) {
      const ws2 = wb.addWorksheet("Défectueux");
      ws2.columns = [
        { header: "Produit", key: "nom", width: 25 }, { header: "SKU", key: "sku", width: 20 },
        { header: "Date", key: "date", width: 15 }, { header: "Source", key: "source", width: 12 },
        { header: "Type défaut", key: "defectType", width: 18 }, { header: "Qté", key: "quantity", width: 8 },
        { header: "Note", key: "note", width: 30 }, { header: "Image URL", key: "imageUrl", width: 40 },
      ];
      ws2.getRow(1).font = { bold: true };
      defItems.forEach((d: any) => ws2.addRow(d));
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="session-${s.name.replace(/[^a-z0-9]/gi, "-")}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    req.log.error(e, "Error exporting session");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── APP STATE ──────────────────────────────────────────────────

router.get("/state", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(appStateTable).limit(1);
    if (!rows.length) {
      res.json({ currentSession: null, packingList: [], scanLog: [], sessionScans: {}, mode: "reception", defectiveInSession: [] });
      return;
    }
    const r = rows[0];
    res.json({
      currentSession: r.currentSession, packingList: r.packingList,
      scanLog: r.scanLog, sessionScans: r.sessionScans, mode: r.mode,
      defectiveInSession: r.defectiveInSession || [],
    });
  } catch (e) {
    req.log.error(e, "Error fetching state");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/state", async (req: Request, res: Response) => {
  try {
    const { currentSession, packingList, scanLog, sessionScans, mode, defectiveInSession } = req.body;
    const rows = await db.select().from(appStateTable).limit(1);
    if (rows.length) {
      await db.update(appStateTable).set({ currentSession, packingList, scanLog, sessionScans, mode, defectiveInSession: defectiveInSession || [] }).where(eq(appStateTable.id, rows[0].id));
    } else {
      await db.insert(appStateTable).values({ currentSession, packingList, scanLog, sessionScans, mode, defectiveInSession: defectiveInSession || [] });
    }
    res.json({ success: true });
  } catch (e) {
    req.log.error(e, "Error saving state");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DEFECTIVE ITEMS ──────────────────────────────────────────────────

router.get("/defective", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(defectiveItemsTable).orderBy(desc(defectiveItemsTable.createdAt));
    res.json(rows.map(r => ({
      id: r.id, sessionId: r.sessionId, sku: r.sku, nom: r.nom, cat: r.cat,
      taille: r.taille, defectType: r.defectType, note: r.note, imageUrl: r.imageUrl,
      source: r.source, date: r.date, quantity: r.quantity,
    })));
  } catch (e) {
    req.log.error(e, "Error fetching defective items");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/defective", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const [row] = await db.insert(defectiveItemsTable).values({
      sessionId: d.sessionId || null, sku: d.sku, nom: d.nom || "",
      cat: d.cat || "", taille: d.taille || "", defectType: d.defectType,
      note: d.note || "", imageUrl: d.imageUrl || "",
      source: d.source || "reception", date: d.date || new Date().toISOString(),
      quantity: d.quantity || 1,
    }).returning();
    res.json({ success: true, id: row.id });
  } catch (e) {
    req.log.error(e, "Error saving defective item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/defective/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(defectiveItemsTable).where(eq(defectiveItemsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (e) {
    req.log.error(e, "Error deleting defective item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/defective/export", async (req: Request, res: Response) => {
  try {
    const { default: ExcelJS } = await import("exceljs");
    const rows = await db.select().from(defectiveItemsTable).orderBy(desc(defectiveItemsTable.createdAt));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Défectueux");
    ws.columns = [
      { header: "Produit", key: "nom", width: 25 }, { header: "SKU", key: "sku", width: 20 },
      { header: "Date", key: "date", width: 20 }, { header: "Source", key: "source", width: 12 },
      { header: "Type défaut", key: "defectType", width: 18 }, { header: "Qté", key: "quantity", width: 8 },
      { header: "Note", key: "note", width: 30 }, { header: "Image URL", key: "imageUrl", width: 40 },
    ];
    ws.getRow(1).font = { bold: true };
    rows.forEach(r => ws.addRow({ nom: r.nom, sku: r.sku, date: r.date, source: r.source, defectType: r.defectType, quantity: r.quantity, note: r.note, imageUrl: r.imageUrl }));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="defectueux.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    req.log.error(e, "Error exporting defective");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── SETTINGS ──────────────────────────────────────────────────

router.get("/settings", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    if (!rows.length) {
      // Bootstrap from env vars
      const defaults = {
        shopifyShopDomain: process.env.SHOPIFY_SHOP_DOMAIN || "",
        shopifyAccessToken: "",
        shopifyClientId: process.env.SHOPIFY_CLIENT_ID || "",
        shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET || "",
        shopifyWebhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || "",
        shopifyEnabled: false,
      };
      res.json(defaults);
      return;
    }
    const r = rows[0];
    res.json({
      shopifyShopDomain: r.shopifyShopDomain,
      shopifyAccessToken: r.shopifyAccessToken ? "***" : "",
      shopifyClientId: r.shopifyClientId,
      shopifyClientSecret: r.shopifyClientSecret ? "***" : "",
      shopifyWebhookSecret: r.shopifyWebhookSecret ? "***" : "",
      shopifyEnabled: r.shopifyEnabled,
    });
  } catch (e) {
    req.log.error(e, "Error fetching settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/settings", async (req: Request, res: Response) => {
  try {
    const { shopifyShopDomain, shopifyAccessToken, shopifyClientId, shopifyClientSecret, shopifyWebhookSecret, shopifyEnabled } = req.body;
    const rows = await db.select().from(settingsTable).limit(1);
    const updateData: any = { shopifyShopDomain: shopifyShopDomain || "", shopifyEnabled: shopifyEnabled || false };
    if (shopifyAccessToken && shopifyAccessToken !== "***") updateData.shopifyAccessToken = shopifyAccessToken;
    if (shopifyClientId) updateData.shopifyClientId = shopifyClientId;
    if (shopifyClientSecret && shopifyClientSecret !== "***") updateData.shopifyClientSecret = shopifyClientSecret;
    if (shopifyWebhookSecret && shopifyWebhookSecret !== "***") updateData.shopifyWebhookSecret = shopifyWebhookSecret;
    if (rows.length) {
      await db.update(settingsTable).set(updateData).where(eq(settingsTable.id, rows[0].id));
    } else {
      await db.insert(settingsTable).values({
        shopifyShopDomain: shopifyShopDomain || "",
        shopifyAccessToken: shopifyAccessToken && shopifyAccessToken !== "***" ? shopifyAccessToken : "",
        shopifyClientId: shopifyClientId || "",
        shopifyClientSecret: shopifyClientSecret && shopifyClientSecret !== "***" ? shopifyClientSecret : "",
        shopifyWebhookSecret: shopifyWebhookSecret && shopifyWebhookSecret !== "***" ? shopifyWebhookSecret : "",
        shopifyEnabled: shopifyEnabled || false,
      });
    }
    res.json({ success: true });
  } catch (e) {
    req.log.error(e, "Error saving settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── SHOPIFY WEBHOOKS ──────────────────────────────────────────────────

async function verifyShopifyWebhook(req: Request): Promise<boolean> {
  const rows = await db.select().from(settingsTable).limit(1);
  if (!rows.length || !rows[0].shopifyWebhookSecret) return true; // skip verification if not configured
  const hmac = req.headers["x-shopify-hmac-sha256"] as string;
  if (!hmac) return false;
  const hash = crypto.createHmac("sha256", rows[0].shopifyWebhookSecret)
    .update((req as any).rawBody || "")
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash));
}

router.post("/webhooks/shopify", async (req: Request, res: Response) => {
  // Respond immediately 200 per Shopify requirements
  res.status(200).json({ ok: true });
  try {
    const topic = req.headers["x-shopify-topic"] as string;
    req.log.info({ topic }, "Shopify webhook received");
    // Handle inventory sync, orders etc. asynchronously
    if (topic === "inventory_levels/update") {
      const { inventory_item_id, available } = req.body;
      req.log.info({ inventory_item_id, available }, "Inventory level updated");
    }
  } catch (e) {
    req.log.error(e, "Error processing Shopify webhook");
  }
});

// ── SHOPIFY STOCK ADJUST ──────────────────────────────────────────────────

router.post("/shopify/adjust-stock", async (req: Request, res: Response) => {
  try {
    const { sku, delta } = req.body;
    const rows = await db.select().from(settingsTable).limit(1);
    if (!rows.length || !rows[0].shopifyEnabled || !rows[0].shopifyAccessToken) {
      res.json({ success: false, reason: "Shopify not configured" });
      return;
    }
    const { shopifyShopDomain, shopifyAccessToken } = rows[0];
    // First find inventory item ID by SKU via products
    const productsResp = await fetch(
      `https://${shopifyShopDomain}/admin/api/2026-01/variants.json?sku=${encodeURIComponent(sku)}`,
      { headers: { "X-Shopify-Access-Token": shopifyAccessToken, "Content-Type": "application/json" } }
    );
    if (!productsResp.ok) { res.json({ success: false, reason: "Shopify API error" }); return; }
    const { variants } = await productsResp.json() as any;
    if (!variants?.length) { res.json({ success: false, reason: "SKU not found in Shopify" }); return; }
    const variant = variants[0];
    // Get inventory item locations
    const locResp = await fetch(
      `https://${shopifyShopDomain}/admin/api/2026-01/inventory_levels.json?inventory_item_ids=${variant.inventory_item_id}`,
      { headers: { "X-Shopify-Access-Token": shopifyAccessToken } }
    );
    if (!locResp.ok) { res.json({ success: false, reason: "Could not get inventory levels" }); return; }
    const { inventory_levels } = await locResp.json() as any;
    if (!inventory_levels?.length) { res.json({ success: false, reason: "No inventory location found" }); return; }
    const locationId = inventory_levels[0].location_id;
    // Adjust stock
    const adjustResp = await fetch(
      `https://${shopifyShopDomain}/admin/api/2026-01/inventory_levels/adjust.json`,
      {
        method: "POST",
        headers: { "X-Shopify-Access-Token": shopifyAccessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, inventory_item_id: variant.inventory_item_id, available_adjustment: delta }),
      }
    );
    res.json({ success: adjustResp.ok });
  } catch (e) {
    req.log.error(e, "Error adjusting Shopify stock");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { catalogueTable, sessionsTable, appStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ── CATALOGUE ──────────────────────────────────────────────────

router.get("/catalogue", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(catalogueTable);
    res.json(rows.map(r => ({
      sku: r.sku,
      nom: r.nom,
      cat: r.cat,
      taille: r.taille,
      couleur: r.couleur,
      stock_initial: r.stockInitial,
    })));
  } catch (e) {
    req.log.error(e, "Error fetching catalogue");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/catalogue", async (req: Request, res: Response) => {
  try {
    const { sku, nom, cat, taille, couleur = "", stock_initial = 0 } = req.body;
    if (!sku || !nom || !cat) {
      res.status(400).json({ error: "sku, nom, cat requis" });
      return;
    }
    await db.insert(catalogueTable).values({ sku, nom, cat, taille, couleur, stockInitial: stock_initial });
    res.json({ success: true });
  } catch (e: any) {
    if (e.code === "23505") {
      res.status(409).json({ error: "SKU déjà existant" });
      return;
    }
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
    const rows = await db.select().from(sessionsTable).orderBy(sessionsTable.createdAt);
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      mode: r.mode,
      shop: r.shop,
      packing: r.packing,
      startDate: r.startDate,
      endDate: r.endDate,
      note: r.note,
      stockAdded: r.stockAdded,
      scans: r.scans,
      log: r.log,
    })).reverse());
  } catch (e) {
    req.log.error(e, "Error fetching sessions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sessions", async (req: Request, res: Response) => {
  try {
    const s = req.body;
    await db.insert(sessionsTable).values({
      id: String(s.id),
      name: s.name,
      type: s.type,
      mode: s.mode,
      shop: s.shop || "",
      packing: s.packing || [],
      startDate: s.startDate,
      endDate: s.endDate || null,
      note: s.note || "",
      stockAdded: s.stockAdded || false,
      scans: s.scans || {},
      log: s.log || [],
    }).onConflictDoUpdate({
      target: sessionsTable.id,
      set: {
        name: s.name,
        type: s.type,
        mode: s.mode,
        shop: s.shop || "",
        packing: s.packing || [],
        startDate: s.startDate,
        endDate: s.endDate || null,
        note: s.note || "",
        stockAdded: s.stockAdded || false,
        scans: s.scans || {},
        log: s.log || [],
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
    const rows = await db.select().from(sessionsTable).where(eq(sessionsTable.id, req.params.id));
    if (!rows.length) { res.status(404).json({ error: "Session non trouvée" }); return; }
    const s = rows[0];
    const scans = (s.scans as Record<string, number>) || {};
    const lines = ["SKU,Scanné"];
    for (const [sku, cnt] of Object.entries(scans)) {
      lines.push(`${sku},${cnt}`);
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="session-${s.name.replace(/[^a-z0-9]/gi,'-')}.csv"`);
    res.send(lines.join("\n"));
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
      res.json({ currentSession: null, packingList: [], scanLog: [], sessionScans: {}, mode: "reception" });
      return;
    }
    const r = rows[0];
    res.json({
      currentSession: r.currentSession,
      packingList: r.packingList,
      scanLog: r.scanLog,
      sessionScans: r.sessionScans,
      mode: r.mode,
    });
  } catch (e) {
    req.log.error(e, "Error fetching state");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/state", async (req: Request, res: Response) => {
  try {
    const { currentSession, packingList, scanLog, sessionScans, mode } = req.body;
    const rows = await db.select().from(appStateTable).limit(1);
    if (rows.length) {
      await db.update(appStateTable).set({ currentSession, packingList, scanLog, sessionScans, mode }).where(eq(appStateTable.id, rows[0].id));
    } else {
      await db.insert(appStateTable).values({ currentSession, packingList, scanLog, sessionScans, mode });
    }
    res.json({ success: true });
  } catch (e) {
    req.log.error(e, "Error saving state");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const catalogueTable = pgTable("catalogue", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  nom: text("nom").notNull(),
  cat: text("cat").notNull(),
  taille: text("taille").notNull(),
  couleur: text("couleur").notNull().default(""),
  stockInitial: integer("stock_initial").notNull().default(0),
});

export const insertCatalogueSchema = createInsertSchema(catalogueTable).omit({ id: true });
export type InsertCatalogue = z.infer<typeof insertCatalogueSchema>;
export type Catalogue = typeof catalogueTable.$inferSelect;

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  mode: text("mode").notNull(),
  shop: text("shop").notNull().default(""),
  packing: jsonb("packing").notNull().default([]),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  note: text("note").notNull().default(""),
  stockAdded: boolean("stock_added").notNull().default(false),
  scans: jsonb("scans").notNull().default({}),
  log: jsonb("log").notNull().default([]),
  defectiveItems: jsonb("defective_items").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;

export const appStateTable = pgTable("app_state", {
  id: serial("id").primaryKey(),
  currentSession: jsonb("current_session"),
  packingList: jsonb("packing_list").notNull().default([]),
  scanLog: jsonb("scan_log").notNull().default([]),
  sessionScans: jsonb("session_scans").notNull().default({}),
  mode: text("mode").notNull().default("reception"),
  defectiveInSession: jsonb("defective_in_session").notNull().default([]),
});

export const insertAppStateSchema = createInsertSchema(appStateTable).omit({ id: true });
export type InsertAppState = z.infer<typeof insertAppStateSchema>;
export type AppState = typeof appStateTable.$inferSelect;

// Defective items registry
export const defectiveItemsTable = pgTable("defective_items", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id"),
  sku: text("sku").notNull(),
  nom: text("nom").notNull().default(""),
  cat: text("cat").notNull().default(""),
  taille: text("taille").notNull().default(""),
  defectType: text("defect_type").notNull(),
  note: text("note").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  source: text("source").notNull().default("reception"),
  date: text("date").notNull(),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDefectiveSchema = createInsertSchema(defectiveItemsTable).omit({ id: true, createdAt: true });
export type InsertDefective = z.infer<typeof insertDefectiveSchema>;
export type DefectiveItem = typeof defectiveItemsTable.$inferSelect;

// App settings (Shopify credentials etc.)
export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  shopifyShopDomain: text("shopify_shop_domain").notNull().default(""),
  shopifyAccessToken: text("shopify_access_token").notNull().default(""),
  shopifyClientId: text("shopify_client_id").notNull().default(""),
  shopifyClientSecret: text("shopify_client_secret").notNull().default(""),
  shopifyWebhookSecret: text("shopify_webhook_secret").notNull().default(""),
  shopifyEnabled: boolean("shopify_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;

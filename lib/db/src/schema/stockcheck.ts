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
});

export const insertAppStateSchema = createInsertSchema(appStateTable).omit({ id: true });
export type InsertAppState = z.infer<typeof insertAppStateSchema>;
export type AppState = typeof appStateTable.$inferSelect;

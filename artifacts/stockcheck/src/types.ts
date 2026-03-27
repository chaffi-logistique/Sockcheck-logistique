export interface Article {
  sku: string;
  nom: string;
  cat: string;
  taille: string;
  couleur: string;
  stock_initial: number;
}

export interface PackingItem {
  sku: string;
  qte: number;
  nom: string;
  taille: string;
}

export interface LogEntry {
  time: string;
  icon: string;
  txt: string;
  type: "ok" | "warn" | "err" | "info";
}

export interface DefectiveItem {
  id?: number;
  sessionId?: string;
  sku: string;
  nom: string;
  cat: string;
  taille: string;
  defectType: string;
  note: string;
  imageUrl: string;
  source: string;
  date: string;
  quantity: number;
}

export interface Session {
  id: string;
  name: string;
  type: string;
  mode: string;
  shop: string;
  packing: PackingItem[];
  startDate: string;
  endDate: string | null;
  note: string;
  stockAdded: boolean;
  scans: Record<string, number>;
  log: LogEntry[];
  defectiveItems: DefectiveItem[];
}

export type Mode = "reception" | "retour" | "retour-libre" | "test" | "inventaire";
export type FilterType = "all" | "manquant" | "surplus" | "ok" | "inconnu" | "defectueux";

export const DEFECT_TYPES = [
  "Tâche", "Défaut de couture", "Déchirure", "Trou", "Mauvaise fabrication", "Autre"
];

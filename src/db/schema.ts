import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Référentiels ──────────────────────────────────────────────────────────────

export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // "sodobat", "easymat", ...
  name: text("name").notNull(),
  active: boolean("active").notNull().default(false),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "daf", "lecteur"] }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Chantiers (centres analytiques). Le pôle est la lettre suffixe du code (1003B → B).
export const centres = pgTable(
  "centres",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id),
    code: text("code").notNull(), // "1003B", "FX", "DEPOT", "53"...
    name: text("name").notNull(),
    pole: text("pole"), // "A".."F" ou null (FX, DEPOT, divers)
  },
  (t) => [uniqueIndex("centres_entity_code").on(t.entityId, t.code)]
);

// ── Nomenclature uniformisée (squelette) ─────────────────────────────────────

// Une catégorie = une ligne du squelette, rattachée à une vue et une section.
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  view: text("view", { enum: ["synthese", "chantier", "fx"] }).notNull(),
  section: text("section").notNull(), // "PRODUITS / CA", "CHARGES D'EXPLOITATION"...
  code: text("code").notNull().unique(), // slug stable, ex. "syn_ca_facturation"
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
  // signe d'affichage : les produits ont un solde créditeur (négatif en balance),
  // on les affiche positifs → sign = -1 ; charges → sign = 1
  sign: integer("sign").notNull().default(1),
  entityScope: text("entity_scope").notNull().default("all"), // "all" ou codes séparés par virgule
  notes: text("notes"),
});

// Règle de mapping compte comptable → catégorie.
// matchType "prefix" : le compte commence par pattern ; "exact" : égalité stricte.
export const accountRules = pgTable(
  "account_rules",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    entityId: integer("entity_id").references(() => entities.id), // null = toutes entités
    pattern: text("pattern").notNull(),
    matchType: text("match_type", { enum: ["exact", "prefix"] }).notNull(),
    // Une règle seed remplacée est désactivée (pas supprimée) : réversible et tracé.
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdBy: text("created_by"), // "seed" ou email utilisateur
  },
  (t) => [index("account_rules_category").on(t.categoryId)]
);

// ── Imports & données brutes ─────────────────────────────────────────────────

export const imports = pgTable(
  "imports",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id),
    type: text("type", { enum: ["ventilee", "analytique"] }).notNull(),
    // Période comptable couverte : dernier mois présent (ventilée) ou mois du snapshot (analytique)
    period: date("period").notNull(), // 1er jour du mois
    fiscalYearStart: integer("fiscal_year_start").notNull(), // ex. 2025 pour l'exercice nov 2025 → oct 2026
    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(),
    status: text("status", {
      enum: ["preview", "validated", "replaced", "rejected"],
    }).notNull(),
    summary: jsonb("summary"), // contrôles calculés au parsing (totaux par classe, etc.)
    createdAt: timestamp("created_at").notNull().defaultNow(),
    validatedAt: timestamp("validated_at"),
    createdBy: text("created_by"),
  },
  (t) => [index("imports_entity_type_period").on(t.entityId, t.type, t.period)]
);

// Balance ventilée (générale) : un montant par compte × mois.
export const generalBalanceLines = pgTable(
  "general_balance_lines",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id),
    account: text("account").notNull(),
    label: text("label").notNull(),
    month: date("month").notNull(), // 1er jour du mois
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    index("gbl_import").on(t.importId),
    index("gbl_entity_month").on(t.entityId, t.month),
  ]
);

// Balance analytique : cumul à date du snapshot, par centre × compte.
export const analyticLines = pgTable(
  "analytic_lines",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id),
    period: date("period").notNull(), // mois du snapshot
    centreCode: text("centre_code").notNull(),
    centreLabel: text("centre_label").notNull(),
    account: text("account").notNull(),
    label: text("label").notNull(),
    debit: numeric("debit", { precision: 14, scale: 2 }).notNull(),
    credit: numeric("credit", { precision: 14, scale: 2 }).notNull(),
    solde: numeric("solde", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    index("al_import").on(t.importId),
    index("al_entity_period").on(t.entityId, t.period),
  ]
);

// ── Saisies manuelles & alertes ──────────────────────────────────────────────

// Travaux en cours / manque à facturer (brouillon → figé) et notes.
export const manualEntries = pgTable(
  "manual_entries",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id),
    period: date("period").notNull(),
    centreCode: text("centre_code"), // null = niveau entité
    field: text("field", {
      enum: ["tec_provision", "note"],
    }).notNull(),
    valueNum: numeric("value_num", { precision: 14, scale: 2 }),
    valueText: text("value_text"),
    status: text("status", { enum: ["draft", "final"] })
      .notNull()
      .default("draft"),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("manual_entries_key").on(
      t.entityId,
      t.period,
      t.centreCode,
      t.field
    ),
  ]
);

export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id),
    importId: integer("import_id").references(() => imports.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: [
        "compte_non_mappe",
        "mois_sans_donnees",
        "montant_constant",
        "ecart_controle",
      ],
    }).notNull(),
    severity: text("severity", { enum: ["info", "warn", "error"] }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    account: text("account"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    period: date("period"),
    status: text("status", { enum: ["open", "resolved"] })
      .notNull()
      .default("open"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("alerts_entity_status").on(t.entityId, t.status)]
);

// Journal d'usage de l'assistant IA — trace les questions et la consommation
// de tokens (poste "Coûts IA variable" de l'abonnement).
export const assistantLogs = pgTable(
  "assistant_logs",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id),
    userEmail: text("user_email").notNull(),
    question: text("question").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("assistant_logs_entity_date").on(t.entityId, t.createdAt)]
);

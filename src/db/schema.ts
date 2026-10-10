import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  real,
  jsonb,
  timestamp,
  date,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const pricingTypeEnum = pgEnum("pricing_type", ["free", "freemium", "paid", "unknown"]);
export const cnAccessEnum = pgEnum("cn_access", ["direct", "unstable", "blocked", "unknown"]);
export const toolStatusEnum = pgEnum("tool_status", ["draft", "listed", "suspect_offline", "offline", "rejected"]);
export const reviewTypeEnum = pgEnum("review_type", ["new_tool", "field_change", "suspect_offline", "duplicate", "user_report"]);
export const reviewStatusEnum = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const rawStatusEnum = pgEnum("raw_status", ["pending", "processed", "skipped", "error"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "success", "failed"]);

/** Two-level taxonomy. parentId null = top-level category. */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id"),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  descriptionEn: text("description_en"),
  descriptionZh: text("description_zh"),
  sort: integer("sort").notNull().default(0),
  sensitive: boolean("sensitive").notNull().default(false),
});

export type Signals = {
  productHuntVotes?: number;
  githubStars?: number;
  githubStarsDelta?: number;
  hfLikes?: number;
  sourceCount?: number;
};

export type SafetyInfo = { flagged: boolean; checkedAt: string; detail?: string };

export const tools = pgTable(
  "tools",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default([]),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    logoUrl: text("logo_url"),
    imageUrl: text("image_url"),
    /** Remote icon / og:image found on the site; the "media" job copies them to our own storage. */
    iconSourceUrl: text("icon_source_url"),
    imageSourceUrl: text("image_source_url"),
    taglineEn: text("tagline_en").notNull().default(""),
    taglineZh: text("tagline_zh").notNull().default(""),
    descriptionEn: text("description_en").notNull().default(""),
    descriptionZh: text("description_zh").notNull().default(""),
    featuresEn: jsonb("features_en").$type<string[]>().notNull().default([]),
    featuresZh: jsonb("features_zh").$type<string[]>().notNull().default([]),
    useCasesEn: jsonb("use_cases_en").$type<string[]>().notNull().default([]),
    useCasesZh: jsonb("use_cases_zh").$type<string[]>().notNull().default([]),
    pricingType: pricingTypeEnum("pricing_type").notNull().default("unknown"),
    pricingNoteEn: text("pricing_note_en").notNull().default(""),
    pricingNoteZh: text("pricing_note_zh").notNull().default(""),
    cnAccess: cnAccessEnum("cn_access").notNull().default("unknown"),
    platforms: text("platforms").array().notNull().default([]),
    openSource: boolean("open_source").notNull().default(false),
    hasCnUi: boolean("has_cn_ui").notNull().default(false),
    hasEnterprise: boolean("has_enterprise").notNull().default(false),
    company: text("company"),
    companyRegion: text("company_region"),
    /** ISO country of the team, e.g. "CN" drives the China AI section. */
    originCountry: text("origin_country"),
    globalUrl: text("global_url"),
    availableRegions: text("available_regions").array().notNull().default([]),
    status: toolStatusEnum("status").notNull().default("draft"),
    /** Jev 1–5 maturity estimate. */
    maturity: real("maturity"),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    listedAt: timestamp("listed_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    signals: jsonb("signals").$type<Signals>().notNull().default({}),
    safety: jsonb("safety").$type<SafetyInfo | null>(),
    heatScore: real("heat_score").notNull().default(0),
    aiScoreZh: real("ai_score_zh"),
    aiScoreEn: real("ai_score_en"),
    rankScoreZh: real("rank_score_zh").notNull().default(0),
    rankScoreEn: real("rank_score_en").notNull().default(0),
    embedding: jsonb("embedding").$type<number[] | null>(),
    /** Lower-cased name + aliases + pinyin + taglines, for trigram search. */
    searchText: text("search_text").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    /** Set when merged into another tool; old slug 301s to the target. */
    mergedIntoId: integer("merged_into_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tools_slug_idx").on(t.slug),
    index("tools_domain_idx").on(t.domain),
    index("tools_status_idx").on(t.status),
  ],
);

export const toolCategories = pgTable(
  "tool_categories",
  {
    toolId: integer("tool_id").notNull(),
    categoryId: integer("category_id").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.toolId, t.categoryId] }), index("tc_cat_idx").on(t.categoryId)],
);

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  /** producthunt | github | huggingface | rss | html_list | manual */
  type: text("type").notNull(),
  /** "api" sources count as trusted for auto-publish. */
  trusted: boolean("trusted").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  /** Minimum ms between requests to the same domain. */
  rateLimitMs: integer("rate_limit_ms").notNull().default(1500),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
});

export const rawItems = pgTable(
  "raw_items",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id").notNull(),
    externalId: text("external_id"),
    url: text("url").notNull(),
    title: text("title").notNull().default(""),
    rawText: text("raw_text").notNull().default(""),
    signals: jsonb("signals").$type<Signals>().notNull().default({}),
    hash: text("hash").notNull(),
    status: rawStatusEnum("status").notNull().default("pending"),
    matchedToolId: integer("matched_tool_id"),
    error: text("error"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("raw_hash_idx").on(t.hash), index("raw_status_idx").on(t.status)],
);

export type ReviewPayload = {
  /** Proposed tool fields (full card for new_tool, changed fields for field_change). */
  fields: Record<string, unknown>;
  /** Fields before the change (field_change). */
  before?: Record<string, unknown>;
  site?: { finalUrl: string; title: string; description: string; httpStatus: number; excerpt: string };
  jev?: Record<string, number>;
  categorySlugs?: string[];
  duplicateOf?: { toolId: number; slug: string; similarity: number };
  sourceKeys?: string[];
};

export const reviewTasks = pgTable(
  "review_tasks",
  {
    id: serial("id").primaryKey(),
    type: reviewTypeEnum("type").notNull(),
    toolId: integer("tool_id"),
    rawItemId: integer("raw_item_id"),
    payload: jsonb("payload").$type<ReviewPayload>().notNull(),
    confidence: real("confidence"),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    status: reviewStatusEnum("status").notNull().default("pending"),
    reviewer: text("reviewer"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_status_idx").on(t.status, t.createdAt)],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: serial("id").primaryKey(),
    toolId: integer("tool_id").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    httpStatus: integer("http_status"),
    ok: boolean("ok").notNull(),
    pageHash: text("page_hash"),
    pricingHash: text("pricing_hash"),
    error: text("error"),
  },
  (t) => [index("snap_tool_idx").on(t.toolId, t.checkedAt)],
);

/** Every Jev decision is kept so a ranking can be audited or appealed. */
export const jevJudgments = pgTable(
  "jev_judgments",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // intake | pair
    toolId: integer("tool_id"),
    rawItemId: integer("raw_item_id"),
    otherToolId: integer("other_tool_id"),
    categoryId: integer("category_id"),
    locale: text("locale"),
    question: text("question").notNull(),
    probabilities: jsonb("probabilities").$type<Record<string, number>>().notNull(),
    judge: text("judge").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jev_tool_idx").on(t.toolId), index("jev_cat_idx").on(t.categoryId, t.createdAt)],
);

export const categoryRankings = pgTable(
  "category_rankings",
  {
    categoryId: integer("category_id").notNull(),
    locale: text("locale").notNull(),
    toolIds: jsonb("tool_ids").$type<number[]>().notNull(),
    pBest: jsonb("p_best").$type<Record<string, number>>().notNull(),
    tieAtTop: boolean("tie_at_top").notNull().default(false),
    judgments: integer("judgments").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.locale] })],
);

export const dailyStats = pgTable(
  "daily_stats",
  {
    toolId: integer("tool_id").notNull(),
    day: date("day").notNull(),
    views: integer("views").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.toolId, t.day] })],
);

export const searchLog = pgTable("search_log", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  locale: text("locale").notNull(),
  results: integer("results").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: serial("id").primaryKey(),
    job: text("job").notNull(),
    args: jsonb("args").$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatusEnum("status").notNull().default("queued"),
    trigger: text("trigger").notNull().default("cron"),
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    log: text("log").notNull().default(""),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("job_status_idx").on(t.status, t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret").notNull(),
  /** Last accepted TOTP time step — a code can't be replayed within its window. */
  lastTotpStep: integer("last_totp_step").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminSessions = pgTable("admin_sessions", {
  /** sha256 of the cookie token; the raw token is never stored. */
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  ip: text("ip"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    ok: boolean("ok").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_key_idx").on(t.key, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    username: text("username"),
    action: text("action").notNull(),
    target: text("target"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type RawItem = typeof rawItems.$inferSelect;
export type ReviewTask = typeof reviewTasks.$inferSelect;

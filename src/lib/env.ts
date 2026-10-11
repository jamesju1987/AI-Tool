/**
 * Central place for environment configuration. Everything optional has a safe default
 * so the site and pipeline run locally with no API keys (mock mode).
 */
function bool(v: string | undefined, d = false) {
  if (v === undefined || v === "") return d;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/aitoolbox",
  siteUrl: (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  siteNameZh: process.env.SITE_NAME_ZH ?? "AI 工具箱",
  siteNameEn: process.env.SITE_NAME_EN ?? "AI Toolbox",
  isProd: process.env.NODE_ENV === "production",

  // ---- Models ----------------------------------------------------------------
  // Jev can be reached two ways (same System One wire format):
  //   1. TYPESAFE_API_KEY (alias JEV_API_KEY) → TypeSafe's own API, POST {base}/v1/systemone
  //   2. OPENROUTER_API_KEY                   → OpenRouter, POST /api/alpha/decisions
  // The direct key wins when both are set.
  typesafeKey: process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || "",
  typesafeBase: (process.env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai").replace(/\/$/, ""),
  openrouterKey: process.env.OPENROUTER_API_KEY ?? "",
  openrouterBase: (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, ""),
  /** "decisions" -> /alpha/decisions, "systemone" -> /v1/systemone (OpenRouter only). */
  jevSurface: process.env.JEV_SURFACE === "systemone" ? "systemone" : "decisions",
  jevModel:
    process.env.JEV_MODEL ||
    (process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY ? "jev-latest" : "typesafe/jev-1.13"),

  // Chat model for bilingual extraction: any OpenAI-compatible API. Defaults to OpenRouter;
  // set LLM_BASE_URL + LLM_API_KEY to use e.g. DeepSeek directly (https://api.deepseek.com/v1).
  llmKey: process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "",
  llmBase: (process.env.LLM_BASE_URL || `${(process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, "")}/v1`).replace(/\/$/, ""),
  llmModel: process.env.LLM_MODEL ?? "deepseek/deepseek-v4.1-flash",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "",

  /** MOCK_AI=true forces offline heuristics even when keys exist (tests, local dev). */
  forceMock: bool(process.env.MOCK_AI, false),
  get llmEnabled() {
    return !this.forceMock && !!this.llmKey;
  },
  get jevEnabled() {
    return !this.forceMock && !!(this.typesafeKey || this.openrouterKey);
  },
  get jevProvider(): "typesafe" | "openrouter" | "none" {
    if (!this.jevEnabled) return "none";
    return this.typesafeKey ? "typesafe" : "openrouter";
  },

  // Sources
  productHuntToken: process.env.PRODUCTHUNT_TOKEN ?? "",
  githubToken: process.env.GITHUB_TOKEN ?? "",

  // Safety
  safeBrowsingKey: process.env.SAFE_BROWSING_API_KEY ?? "",
  fetchUserAgent:
    process.env.FETCH_USER_AGENT ?? "AIToolboxBot/1.0 (+https://example.com/bot; respects robots.txt)",

  // Admin
  /** Secure cookies need HTTPS; COOKIE_SECURE=false for a local http://localhost run. */
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
  sessionHours: Number(process.env.ADMIN_SESSION_HOURS ?? 12),
  adminIpAllowlist: (process.env.ADMIN_IP_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  revalidateSecret: process.env.REVALIDATE_SECRET ?? "",
  notifyWebhook: process.env.NOTIFY_WEBHOOK_URL ?? "",
  timezone: process.env.TZ_SCHEDULE ?? "Asia/Shanghai",
};

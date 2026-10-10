"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { categories, reviewTasks, sources, tools } from "@/db/schema";
import { audit, login, logout, requireAdmin } from "@/lib/auth";
import { revalidateSite } from "@/lib/revalidate";
import { DEFAULT_SETTINGS, getSettings, setSetting, type AppSettings } from "@/lib/settings";
import { isJobName } from "@/pipeline/jobs/meta";
import { queueManualUrls } from "@/pipeline/manual";
import { mergeTools, setCategories, setStatus, updateTool } from "@/pipeline/publish";
import { enqueue } from "@/pipeline/queue";
import { parseToolForm } from "./form";

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

const fail = (e: unknown): ActionState => ({ error: e instanceof Error ? e.message : String(e) });

// ---------------------------------------------------------------- auth
export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await login(String(fd.get("username") ?? ""), String(fd.get("password") ?? ""), String(fd.get("code") ?? ""));
  if (!res.ok) return { error: res.error };
  redirect("/admin");
}

export async function logoutAction() {
  await requireAdmin();
  await audit("logout");
  await logout();
  redirect("/admin/login");
}

// ---------------------------------------------------------------- review queue
async function loadTask(id: number) {
  const [task] = await db.select().from(reviewTasks).where(eq(reviewTasks.id, id));
  if (!task || task.status !== "pending") throw new Error("这条任务已被处理");
  return task;
}

async function closeTask(id: number, status: "approved" | "rejected", reviewer: string) {
  await db.update(reviewTasks).set({ status, reviewer, decidedAt: new Date() }).where(eq(reviewTasks.id, id));
}

/** Approve a new tool (with the editor's edits) and list it. */
export async function approveNewTool(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const task = await loadTask(Number(fd.get("taskId")));
    if (!task.toolId) throw new Error("任务缺少工具");
    const parsed = parseToolForm(fd);
    if (!parsed.fields.taglineZh || !parsed.fields.taglineEn) throw new Error("上架前请填写中英文一句话简介");
    await updateTool(task.toolId, parsed.fields);
    await setCategories(task.toolId, parsed.primaryCategory, parsed.secondaryCategories);
    await setStatus(task.toolId, "listed");
    await closeTask(task.id, "approved", admin.username);
    await audit("review_approve", `tool:${task.toolId}`, { task: task.id, type: task.type });
    await revalidateSite();
    return { ok: true, message: `已上架：${parsed.fields.name}` };
  } catch (e) {
    return fail(e);
  }
}

/** Reject: drafts become "rejected" (the domain is remembered so it's not re-queued). */
export async function rejectTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const task = await loadTask(Number(fd.get("taskId")));
    if (task.toolId && (task.type === "new_tool" || task.type === "duplicate")) await setStatus(task.toolId, "rejected");
    if (task.toolId && task.type === "suspect_offline") await setStatus(task.toolId, "listed");
    await closeTask(task.id, "rejected", admin.username);
    await audit("review_reject", task.toolId ? `tool:${task.toolId}` : null, { task: task.id, type: task.type, note: String(fd.get("note") ?? "") });
    await revalidateSite();
    return { ok: true, message: "已驳回" };
  } catch (e) {
    return fail(e);
  }
}

/** Duplicate: fold the draft into the existing tool (its name becomes an alias). */
export async function mergeDuplicate(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const task = await loadTask(Number(fd.get("taskId")));
    const into = Number(fd.get("intoId"));
    if (!task.toolId || !into) throw new Error("缺少合并目标");
    await mergeTools(task.toolId, into);
    await closeTask(task.id, "approved", admin.username);
    await audit("review_merge", `tool:${task.toolId}`, { into });
    await revalidateSite();
    return { ok: true, message: "已合并到现有工具" };
  } catch (e) {
    return fail(e);
  }
}

/** Field change from patrol: apply the checked fields. */
export async function approveFieldChange(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const task = await loadTask(Number(fd.get("taskId")));
    if (!task.toolId) throw new Error("任务缺少工具");
    const chosen = new Set(fd.getAll("apply").map(String));
    const suggested = (task.payload.fields._suggested ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(task.payload.fields)) if (k !== "_suggested" && chosen.has(k)) patch[k] = v;
    for (const [k, v] of Object.entries(suggested)) if (chosen.has(k) && v) patch[k] = v;
    await updateTool(task.toolId, patch);
    await closeTask(task.id, "approved", admin.username);
    await audit("review_field_change", `tool:${task.toolId}`, { fields: Object.keys(patch) });
    await revalidateSite();
    return { ok: true, message: `已更新 ${Object.keys(patch).length} 个字段` };
  } catch (e) {
    return fail(e);
  }
}

/** Suspected offline: confirm and take the tool down (its page stays, marked as shut down). */
export async function confirmOffline(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const task = await loadTask(Number(fd.get("taskId")));
    if (!task.toolId) throw new Error("任务缺少工具");
    await setStatus(task.toolId, "offline");
    await closeTask(task.id, "approved", admin.username);
    await audit("review_offline", `tool:${task.toolId}`);
    await revalidateSite();
    return { ok: true, message: "已标记为停运" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- tools
export async function saveTool(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const id = Number(fd.get("toolId"));
    const parsed = parseToolForm(fd);
    await updateTool(id, parsed.fields, { pinned: fd.get("pinned") === "on" });
    await setCategories(id, parsed.primaryCategory, parsed.secondaryCategories);
    await audit("tool_save", `tool:${id}`);
    await revalidateSite();
    return { ok: true, message: "已保存" };
  } catch (e) {
    return fail(e);
  }
}

const STATUSES = z.enum(["listed", "draft", "suspect_offline", "offline", "rejected"]);
export async function setToolStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const id = Number(fd.get("toolId"));
    const status = STATUSES.parse(fd.get("status"));
    await setStatus(id, status);
    await audit("tool_status", `tool:${id}`, { status });
    await revalidateSite();
    return { ok: true, message: `状态已改为 ${status}` };
  } catch (e) {
    return fail(e);
  }
}

export async function mergeToolAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const id = Number(fd.get("toolId"));
    const slug = String(fd.get("intoSlug") ?? "").trim();
    const [into] = await db.select({ id: tools.id }).from(tools).where(eq(tools.slug, slug));
    if (!into) throw new Error(`找不到 slug 为 ${slug} 的工具`);
    await mergeTools(id, into.id);
    await audit("tool_merge", `tool:${id}`, { into: into.id });
    await revalidateSite();
    return { ok: true, message: `已合并到 ${slug}，旧地址会 301 跳转` };
  } catch (e) {
    return fail(e);
  }
}

export async function recheckTool(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = Number(fd.get("toolId"));
  await enqueue("patrol", { toolId: id }, "admin");
  await audit("tool_recheck", `tool:${id}`);
  return { ok: true, message: "已加入巡检队列" };
}

// ---------------------------------------------------------------- intake
export async function addUrls(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const urls = String(fd.get("urls") ?? "").split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean).slice(0, 500);
    if (!urls.length) throw new Error("请粘贴至少一个网址");
    const n = await queueManualUrls(urls);
    await enqueue("process", {}, "admin");
    await audit("intake_add", null, { count: n });
    return { ok: true, message: `已加入 ${n} 个网址，处理任务已排队；完成后会出现在审核队列。` };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- categories
const catSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "slug 只能用小写字母、数字和 -"),
  nameZh: z.string().trim().min(1).max(30),
  nameEn: z.string().trim().min(1).max(60),
  descriptionZh: z.string().trim().max(120).optional(),
  descriptionEn: z.string().trim().max(200).optional(),
  parentId: z.coerce.number().int().optional(),
  sort: z.coerce.number().int().default(0),
});

export async function saveCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const raw = Object.fromEntries([...fd.entries()].filter(([k, v]) => !k.startsWith("$") && v !== ""));
    const data = catSchema.parse(raw);
    const id = Number(fd.get("id") || 0);
    const values = { ...data, parentId: data.parentId || null, sensitive: fd.get("sensitive") === "on" };
    if (id) await db.update(categories).set(values).where(eq(categories.id, id));
    else await db.insert(categories).values(values);
    await audit(id ? "category_update" : "category_create", data.slug);
    await revalidateSite();
    return { ok: true, message: "已保存" };
  } catch (e) {
    return fail(e);
  }
}

export async function moveCategoryTools(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const from = String(fd.get("from"));
    const to = String(fd.get("to"));
    const [src] = await db.select().from(categories).where(eq(categories.slug, from));
    if (!src) throw new Error("源分类不存在");
    const { toolCategories } = await import("@/db/schema");
    const rows = await db.select().from(toolCategories).where(and(eq(toolCategories.categoryId, src.id), eq(toolCategories.isPrimary, true)));
    for (const r of rows) await setCategories(r.toolId, to);
    await audit("category_move_tools", from, { to, count: rows.length });
    await revalidateSite();
    return { ok: true, message: `已迁移 ${rows.length} 个工具到 ${to}` };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- sources & jobs
export async function saveSource(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const id = Number(fd.get("id"));
    const config = JSON.parse(String(fd.get("config") || "{}"));
    if (typeof config !== "object" || Array.isArray(config)) throw new Error("配置必须是 JSON 对象");
    const patch = {
      enabled: fd.get("enabled") === "on",
      trusted: fd.get("trusted") === "on",
      rateLimitMs: Math.max(0, Number(fd.get("rateLimitMs") || 1500)),
      config,
    };
    if (id) {
      await db.update(sources).set(patch).where(eq(sources.id, id));
    } else {
      const key = String(fd.get("key") ?? "").trim();
      const type = String(fd.get("type") ?? "");
      if (!/^[a-z0-9_-]{2,30}$/.test(key)) throw new Error("key 只能用小写字母、数字、- 和 _");
      if (!["rss", "html_list", "github", "producthunt", "huggingface"].includes(type)) throw new Error("未知类型");
      await db.insert(sources).values({ ...patch, key, type, name: String(fd.get("name") || key) });
    }
    await audit(id ? "source_update" : "source_create", String(fd.get("key") ?? id));
    return { ok: true, message: "已保存" };
  } catch (e) {
    return fail(e);
  }
}

export async function runJobNow(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const job = String(fd.get("job"));
  if (!isJobName(job)) return { error: "未知任务" };
  const args = fd.get("source") ? { source: String(fd.get("source")) } : {};
  const r = await enqueue(job, args, "admin");
  await audit("job_enqueue", job, args);
  return { ok: true, message: r.queued ? `已排队（#${r.id}），worker 会在几秒内开始` : `已有同类任务在排队或运行（#${r.id}）` };
}

// ---------------------------------------------------------------- settings
const num01 = z.coerce.number().min(0).max(1);
export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const cur = await getSettings();
    const next: AppSettings = {
      ...cur,
      autoPublish: fd.get("autoPublish") === "on",
      thresholds: {
        isTool: num01.parse(fd.get("t_isTool")),
        neutral: num01.parse(fd.get("t_neutral")),
        categoryFit: num01.parse(fd.get("t_categoryFit")),
        maxInjection: num01.parse(fd.get("t_maxInjection")),
        duplicateSimilarity: num01.parse(fd.get("t_duplicateSimilarity")),
      },
      weights: { ai: num01.parse(fd.get("w_ai")), behavior: num01.parse(fd.get("w_behavior")), external: num01.parse(fd.get("w_external")), freshness: num01.parse(fd.get("w_freshness")) },
      heatWeights: { clicks: num01.parse(fd.get("h_clicks")), views: num01.parse(fd.get("h_views")), external: num01.parse(fd.get("h_external")), freshness: num01.parse(fd.get("h_freshness")) },
      reviewBacklogLimit: z.coerce.number().int().min(10).max(10000).parse(fd.get("reviewBacklogLimit")),
      blockedDomains: String(fd.get("blockedDomains") ?? "").split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean),
      pairwise: { budgetPerItem: z.coerce.number().int().min(2).max(30).parse(fd.get("p_budget")), maxItemsPerCategory: z.coerce.number().int().min(2).max(200).parse(fd.get("p_max")) },
    };
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) await setSetting(k, next[k] as never);
    await audit("settings_save", null, { autoPublish: next.autoPublish });
    return { ok: true, message: "设置已保存" };
  } catch (e) {
    return fail(e);
  }
}

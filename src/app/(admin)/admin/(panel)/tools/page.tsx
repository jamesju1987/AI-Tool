import Link from "next/link";
import { and, desc, eq, ilike, or, sql as dsql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { tools } from "@/db/schema";
import { input } from "../ui";

const STATUS_LABEL: Record<string, string> = { listed: "在架", draft: "草稿", suspect_offline: "疑似下线", offline: "已下线", rejected: "已驳回" };

export default async function ToolsAdmin({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const conds: SQL[] = [];
  if (sp.status && sp.status in STATUS_LABEL) conds.push(eq(tools.status, sp.status as "listed"));
  if (sp.q) {
    const like = `%${sp.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(or(ilike(tools.name, like), ilike(tools.slug, like), ilike(tools.domain, like))!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select({ id: tools.id, slug: tools.slug, name: tools.name, domain: tools.domain, status: tools.status, heat: tools.heatScore, rankZh: tools.rankScoreZh, listedAt: tools.listedAt, lastCheckedAt: tools.lastCheckedAt, pinned: tools.pinned })
      .from(tools).where(where).orderBy(desc(tools.updatedAt)).limit(50).offset(page * 50),
    db.select({ total: dsql<number>`count(*)::int` }).from(tools).where(where),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ q: sp.q, status: sp.status, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/tools${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q} placeholder="名称 / slug / 域名" className={`${input} max-w-xs`} />
        <select name="status" defaultValue={sp.status ?? ""} className={`${input} w-36`}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="h-9 rounded-md bg-ink px-3 text-sm text-canvas">筛选</button>
        <span className="ml-auto text-sm text-muted">{total} 条</span>
      </form>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr><th className="px-3 py-2">工具</th><th>状态</th><th>热度</th><th>综合分</th><th>收录</th><th>核验</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/admin/tools/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                  {t.pinned && <span className="ml-1 text-xs text-accent">置顶</span>}
                  <span className="block text-xs text-muted">{t.domain}</span>
                </td>
                <td>{STATUS_LABEL[t.status]}</td>
                <td className="tabular-nums">{t.heat.toFixed(2)}</td>
                <td className="tabular-nums">{t.rankZh.toFixed(2)}</td>
                <td className="text-muted">{t.listedAt?.toLocaleDateString("zh-CN") ?? "—"}</td>
                <td className="text-muted">{t.lastCheckedAt?.toLocaleDateString("zh-CN") ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm">
        {page > 0 ? <Link href={qs({ page: String(page - 1) })} className="underline">上一页</Link> : <span />}
        {(page + 1) * 50 < total && <Link href={qs({ page: String(page + 1) })} className="underline">下一页</Link>}
      </div>
    </div>
  );
}

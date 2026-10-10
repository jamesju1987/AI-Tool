import Link from "next/link";
import { eq, sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { reviewTasks } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { logoutAction } from "../actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(reviewTasks).where(eq(reviewTasks.status, "pending"));
  const nav = [
    { href: "/admin", label: "概览" },
    { href: "/admin/review", label: `审核队列${n ? `（${n}）` : ""}` },
    { href: "/admin/tools", label: "工具" },
    { href: "/admin/add", label: "添加网址" },
    { href: "/admin/categories", label: "分类" },
    { href: "/admin/sources", label: "数据源" },
    { href: "/admin/jobs", label: "任务日志" },
    { href: "/admin/settings", label: "设置" },
    { href: "/admin/audit", label: "审计日志" },
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <span className="font-display font-semibold">{env.siteNameZh} · 后台</span>
          <nav className="flex flex-wrap gap-4">
            {nav.map((x) => (
              <Link key={x.href} href={x.href} className="text-muted hover:text-ink">{x.label}</Link>
            ))}
          </nav>
          <span className="ml-auto flex items-center gap-3 text-muted">
            {env.mockAi && <span className="rounded bg-warn/15 px-2 py-0.5 text-warn">离线模式：未配置 OPENROUTER_API_KEY</span>}
            <a href="/zh" target="_blank" className="hover:text-ink">查看网站</a>
            <span>{admin.username}</span>
            <form action={logoutAction}><button className="hover:text-ink">退出</button></form>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { Section } from "../ui";

export default async function AuditPage() {
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(200);
  return (
    <Section title="审计日志（最近 200 条）">
      <table className="w-full text-sm">
        <thead className="text-left text-muted"><tr><th className="py-1">时间</th><th>账号</th><th>操作</th><th>对象</th><th>IP</th><th>详情</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line align-top">
              <td className="py-1.5 whitespace-nowrap text-muted">{r.createdAt.toLocaleString("zh-CN", { hour12: false })}</td>
              <td>{r.username ?? "—"}</td>
              <td className={r.action.includes("failed") ? "text-danger" : ""}>{r.action}</td>
              <td>{r.target ?? ""}</td>
              <td className="text-muted">{r.ip}</td>
              <td className="max-w-xs truncate text-xs text-muted">{Object.keys(r.detail).length ? JSON.stringify(r.detail) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

import Link from "next/link";

export function Stat({ label, value, href, accent }: { label: string; value: number; href?: string; accent?: boolean }) {
  const body = (
    <>
      <span className="block text-sm text-muted">{label}</span>
      <span className={`mt-1 block font-display text-3xl font-semibold tabular-nums ${accent ? "text-accent" : ""}`}>{value}</span>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border border-line bg-surface p-4 hover:border-ink">{body}</Link>
  ) : (
    <div className="rounded-xl border border-line bg-surface p-4">{body}</div>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function JobStatus({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    queued: ["排队中", "text-muted"],
    running: ["运行中", "text-warn"],
    success: ["成功", "text-accent"],
    failed: ["失败", "text-danger"],
  };
  const [label, cls] = map[status] ?? [status, ""];
  return <span className={cls}>{label}</span>;
}

export const input = "h-9 w-full rounded-md border border-line bg-surface px-2 text-sm";
export const textarea = "w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm";

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns } from "@/db/schema";
import { JOB_META } from "@/pipeline/jobs/meta";
import { runJobNow } from "../../../actions";
import { ActionForm, SubmitButton } from "../../../components";
import { JobStatus, Section } from "../../ui";

export default async function JobRun({ params }: { params: Promise<{ id: string }> }) {
  const [run] = await db.select().from(jobRuns).where(eq(jobRuns.id, Number((await params).id)));
  if (!run) notFound();
  return (
    <div className="space-y-4">
      <Link href="/admin/jobs" className="text-sm text-muted hover:text-ink">← 任务日志</Link>
      <Section
        title={`#${run.id} ${JOB_META[run.job as keyof typeof JOB_META]?.label ?? run.job}`}
        action={
          <ActionForm action={runJobNow} refresh={false}>
            <input type="hidden" name="job" value={run.job} />
            {typeof run.args.source === "string" && <input type="hidden" name="source" value={run.args.source} />}
            <SubmitButton variant="secondary">重新运行</SubmitButton>
          </ActionForm>
        }
      >
        <p className="text-sm">状态：<JobStatus status={run.status} />，触发：{run.trigger}，参数：{JSON.stringify(run.args)}</p>
        <p className="mt-1 text-sm">统计：{JSON.stringify(run.stats)}</p>
        {run.error && <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-canvas p-3 text-xs text-danger">{run.error}</pre>}
        <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-canvas p-3 text-xs">{run.log || "（无日志）"}</pre>
      </Section>
    </div>
  );
}

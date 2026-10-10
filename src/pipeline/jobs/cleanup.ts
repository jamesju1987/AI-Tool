import { and, lt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { adminSessions, jobRuns, loginAttempts, rawItems, searchLog, snapshots } from "@/db/schema";
import type { JobContext } from "../runner";

/** Weekly housekeeping so tables don't grow forever. */
export async function cleanup(ctx: JobContext) {
  const days = (n: number) => new Date(Date.now() - n * 86400_000);
  const r1 = await db.delete(snapshots).where(lt(snapshots.checkedAt, days(120))).returning({ id: snapshots.id });
  const r2 = await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, days(30))).returning({ id: loginAttempts.id });
  const r3 = await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date())).returning({ id: adminSessions.id });
  const r4 = await db.delete(jobRuns).where(lt(jobRuns.createdAt, days(90))).returning({ id: jobRuns.id });
  const r5 = await db.delete(searchLog).where(lt(searchLog.createdAt, days(90))).returning({ id: searchLog.id });
  // Keep processed raw items' hashes (dedupe), but drop their bulky text after 30 days.
  await db.update(rawItems).set({ rawText: "" }).where(and(lt(rawItems.fetchedAt, days(30)), ne(rawItems.status, "pending")));
  ctx.log(`removed ${r1.length} snapshots, ${r2.length} login attempts, ${r3.length} sessions, ${r4.length} job runs, ${r5.length} search logs`);
}

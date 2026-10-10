import type { JobFn } from "../runner";
import { cleanup } from "./cleanup";
import { collect } from "./collect";
import { digest } from "./digest";
import { media } from "./media";
import { JOB_META, type JobName } from "./meta";
import { patrol } from "./patrol";
import { processRaw } from "./process";
import { rank } from "./rank";
import { scores } from "./scores";

export type JobDef = { fn: JobFn; label: string; schedule: string | null };

const FNS: Record<JobName, JobFn> = { collect, process: processRaw, media, patrol, scores, digest, rank, cleanup };

export const JOBS: Record<string, JobDef> = Object.fromEntries(
  (Object.keys(JOB_META) as JobName[]).map((k) => [k, { fn: FNS[k], ...JOB_META[k] }]),
);

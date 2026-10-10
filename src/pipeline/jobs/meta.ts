/**
 * Job names, labels and schedules — kept apart from the job code so the admin UI can
 * list and queue jobs without bundling the crawler.
 *
 * Daily rhythm (PRD §6), in TZ_SCHEDULE (default Asia/Shanghai):
 * collect every 6h → process 20 min later → media; patrol daily for tools that are due;
 * scores 05:00; digest 07:00 (after the night's intake); pairwise rank Monday 01:00.
 */
export const JOB_META = {
  collect: { label: "采集数据源", schedule: "0 2,8,14,20 * * *" },
  process: { label: "AI 抽取、去重与分流", schedule: "20 2,8,14,20 * * *" },
  media: { label: "下载 Logo 与预览图", schedule: "50 2,8,14,20 * * *" },
  patrol: { label: "官网巡检", schedule: "0 3 * * *" },
  scores: { label: "热度与综合分", schedule: "0 5 * * *" },
  digest: { label: "每日审核提醒", schedule: "0 7 * * *" },
  rank: { label: "Jev 两两排序", schedule: "0 1 * * 1" },
  cleanup: { label: "数据清理", schedule: "30 4 * * 0" },
} as const satisfies Record<string, { label: string; schedule: string | null }>;

export type JobName = keyof typeof JOB_META;
export const isJobName = (s: string): s is JobName => s in JOB_META;

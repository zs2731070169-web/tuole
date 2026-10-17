// 消息中心纯函数（2026-10-18 提醒重构）：每日首启摘要的聚合口径与消息构造。
// 聚合语义承继旧桌面 reminder.cjs 的 dueKind——今天（执行期覆盖今天且已开始）+ 逾期欠账，
// 跳过草稿/未安排/未来/已完成；实现收敛到渲染层状态机派生（传入 TaskView[]，主进程双读版随之消亡）。
import type { AppMessage, DailyDigestPayload, TaskStatus, TaskView } from "./types";
import { firstScheduledDay } from "./taskDates";

/** 消息滚动保留条数：按 dayKey 降序留最近 N 条（与备份快照 MAX_BACKUPS 同量级） */
export const MAX_MESSAGES = 10;

/** 消息卡片内最多直接展示的任务行数；载荷仍保存全部引用，保证状态与计数可实时同步。 */
export const DIGEST_TITLE_CAP = 5;

/** 摘要聚合口径：状态机 today/overdue；草稿由调用方 views 派生排除，此处再防御一层 */
export function selectDigestViews(views: TaskView[]): TaskView[] {
  return views.filter((v) => v.draft !== true && (v.status === "today" || v.status === "overdue"));
}

/** 构造摘要载荷：双零（当天无事可报）返回 null——不落空摘要消息，不给用户发「今天没事」噪音 */
export function buildDailyDigest(views: TaskView[]): DailyDigestPayload | null {
  const due = selectDigestViews(views);
  if (due.length === 0) return null;
  const todayTasks = due.filter((v) => v.status === "today");
  const overdueTasks = due.filter((v) => v.status === "overdue");
  const listed = [...todayTasks, ...overdueTasks];
  return {
    todayCount: todayTasks.length,
    overdueCount: overdueTasks.length,
    // 保存全部 taskId 才能在任务完成/改期/删除后实时重算消息状态与计数；title 仅作删除后的兜底快照。
    tasks: listed.map((v) => ({ taskId: v.id, title: v.title })),
    hiddenCount: 0,
  };
}

export interface SyncedDigestTask {
  taskId: string;
  title: string;
  status: TaskStatus | "deleted";
  task: TaskView | null;
}

export interface SyncedDailyDigest {
  todayCount: number;
  overdueCount: number;
  tasks: SyncedDigestTask[];
  /** 仅兼容旧版曾截断引用的持久化消息；新版隐藏数由 tasks.length - 展示上限实时计算。 */
  legacyHiddenCount: number;
}

/** 用当前任务库刷新消息的标题、状态与计数；消息只保存成员身份，不保存会过期的展示状态。 */
export function syncDailyDigest(digest: DailyDigestPayload, views: TaskView[]): SyncedDailyDigest {
  const byId = new Map(views.filter((view) => view.draft !== true).map((view) => [view.id, view]));
  const tasks = digest.tasks.map<SyncedDigestTask>((ref) => {
    const task = byId.get(ref.taskId) ?? null;
    return {
      taskId: ref.taskId,
      title: task?.title ?? ref.title,
      status: task?.status ?? "deleted",
      task,
    };
  });
  return {
    todayCount: tasks.filter((task) => task.status === "today").length,
    overdueCount: tasks.filter((task) => task.status === "overdue").length,
    tasks,
    legacyHiddenCount: Math.max(0, digest.hiddenCount),
  };
}

/** 消息跳转锚点：原消息日仍属于当前执行日期时优先保留；改期后跟随任务当前首日。 */
export function digestTaskTargetDay(
  task: Pick<TaskView, "scheduledDates" | "parkedDate">,
  messageDay: string,
): string {
  if (task.scheduledDates.includes(messageDay)) return messageDay;
  return firstScheduledDay(task) ?? task.parkedDate ?? messageDay;
}

/** 构造未读消息实体：id = `digest-{dayKey}`（dayKey 兼作当日去重键） */
export function buildDigestMessage(dayKey: string, digest: DailyDigestPayload, createdAt: string): AppMessage {
  return { id: `digest-${dayKey}`, kind: "dailyDigest", dayKey, createdAt, readAt: null, digest };
}

/** 未读计数（红点判定依据）：readAt 为 null 的消息数 */
export function unreadMessageCount(messages: AppMessage[]): number {
  return messages.reduce((count, message) => (message.readAt === null ? count + 1 : count), 0);
}

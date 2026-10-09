// 状态机核心：computeAutoStatus 纯函数
// 前端展示与结算逻辑共用同一份规则，保证「写自动流转 / 读只筛选」一致
import type { Task, TaskStatus } from "./types";
import { todayKey, compareDateKeys } from "../lib/date";
import { firstScheduledDay, lastScheduledDay } from "./taskDates";

export interface StatusRuleContext {
  now: Date; // 当前时间
}

/**
 * 计算任务的「视图状态」。status 永不入库，全部由此派生。
 * 规则（对应需求文档第二章第 2 节；2026-10-09 起执行期 = 日期集合）：
 * - done 优先：已完成不再回到活动区
 * - 日期集合为空 -> unscheduled
 * - 今天早于首个执行日 -> upcoming
 * - 今天在集合内某一天 -> today（含两端语义由集合 includes 承载）
 * - 今天晚于末个执行日 -> overdue（绝不自动完成）
 */
export function computeAutoStatus(
  task: Pick<Task, "scheduledDates" | "completedAt" | "startedAt">,
  ctx: StatusRuleContext,
): TaskStatus {
  const today = todayKey(ctx.now);

  // 1) 已结束的任务
  if (task.completedAt) {
    return "done";
  }

  // 2) 未安排由独立生命周期标记决定，不再由「有无日期」代理。
  // 旧数据没有 startedAt：有日期按旧语义视为已安排，空日期视为未安排。
  if (!hasTaskStarted(task)) return "unscheduled";

  // 3) 防御坏数据：已开始却没有日期时回落未安排
  const first = firstScheduledDay(task);
  if (!first) return "unscheduled";

  // 3) 按集合首末分区（分散日期同样成立：任一天覆盖今天即为 today）
  if (compareDateKeys(first, today) > 0) return "upcoming";
  const last = lastScheduledDay(task)!;
  if (compareDateKeys(last, today) < 0) return "overdue";
  return "today";
}

/** 是否已经通过「安排」进入活动生命周期。 */
export function hasTaskStarted(task: Pick<Task, "scheduledDates" | "startedAt">): boolean {
  return task.startedAt === undefined ? task.scheduledDates.length > 0 : task.startedAt !== null;
}

// 「进行中」聚合：upcoming + today（2026-10 用户决策：未安排单独统计/筛选，不再并入进行中——
// 统计卡与筛选栏同口径，避免两处「进行中」含义漂移）
export const ACTIVE_STATUSES: TaskStatus[] = ["upcoming", "today"];

export function isActive(status: TaskStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

// 「可结束」聚合：today + overdue。
// 只有「排期已到」的任务（今天 / 已逾期）才提供「完成/结束」入口——
// 未安排（unscheduled）与未来安排（upcoming）都不在执行期，卡片按钮、
// 编辑抽屉底部动作条、拖入已完成栏三处统一以 canFinish 门禁；
// 要结束需先排期（scheduleTo / 拖入今日栏 / 顺延改期），日期到达今天或更早。
// done 已结束，同样无「结束」语义。
export const FINISHABLE_STATUSES: TaskStatus[] = ["today", "overdue"];

export function canFinish(status: TaskStatus): boolean {
  return FINISHABLE_STATUSES.includes(status);
}

// 状态中文标签与语义色（供 UI 统一取用）
export const STATUS_META: Record<
  TaskStatus,
  { label: string; tone: "muted" | "primary" | "accent" | "warning" | "success" }
> = {
  unscheduled: { label: "未安排", tone: "muted" },
  upcoming: { label: "即将到来", tone: "primary" },
  today: { label: "今天", tone: "accent" },
  overdue: { label: "逾期", tone: "warning" },
  done: { label: "已完成", tone: "success" },
};

// 状态文字 chip 的配色（浅底 + 语义色文字）：任务行/编辑抽屉共用，勿在各组件重复内联
export function statusToneClass(status: TaskStatus): string {
  switch (status) {
    case "today":
      return "bg-status-today/15 text-status-today";
    case "overdue":
      return "bg-status-overdue/15 text-status-overdue";
    case "upcoming":
      return "bg-status-upcoming/15 text-foreground";
    case "done":
      return "bg-status-done/15 text-status-done";
    default:
      return "bg-muted text-muted-foreground";
  }
}

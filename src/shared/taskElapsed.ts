// 任务开销窗口契约（2026-10-10 用户定调：**只在「进行中」计时**，纯派生、零存储改动）：
// 窗口 = [max(startedAt ?? createdAt, 执行首日 00:00), min(completedAt ?? now, 执行末日 24:00)]——
// - 未安排（未放入进行中）/ 未来安排 → 无窗口不计时（upcoming 可能已带 startedAt，执行期未到同样不计）；
// - 已完成 → 停在完成时刻（完成晚于末日时截在末日 24:00）；
// - 逾期 → 超出末日的部分截断（窗口冻结在末日 24:00；改期/顺延把末日推后即自动恢复计时）；
// - 分散日期集合按首末夹逼连续计（与状态机「空档日同样计 today」同口径）。
// 时间均为本地时区（与日键 YYYY-MM-DD 口径一致）。历史任务字段基本可回溯（个别迁移伪影按上方防御近似）。
// 注意：进行中耗时不带实时跳秒计时器，随渲染时计算（日粒度应用，scheduler 跨午夜结算触发重派生）。
import type { Task, TaskStatus } from "./types";
import { addDaysKey, fromDateKey } from "../lib/date";
import { firstScheduledDay, lastScheduledDay } from "./taskDates";
import { t, type Lang } from "../lib/i18n";

export type ElapsedUnit = "minute" | "hour" | "day";

export interface TaskElapsed {
  // spent = 已完成定档耗时；running = 截至观察时刻（窗口截止）的进行中/冻结时长
  kind: "spent" | "running";
  unit: ElapsedUnit;
  value: number;
}

/** 某日 00:00（本地）的 epoch 毫秒 */
function dayStartEpoch(dayKey: string): number {
  return fromDateKey(dayKey).getTime();
}

/** 某日 24:00（本地）= 次日 00:00 的 epoch 毫秒——执行末日闭区间的窗口终点 */
function dayEndEpoch(dayKey: string): number {
  return dayStartEpoch(addDaysKey(dayKey, 1));
}

/** 安全解析 ISO 时间戳；非法返回 NaN */
function parseEpoch(iso: string): number {
  return new Date(iso).getTime();
}

export interface TaskSpendWindow {
  startEpoch: number;
  endEpoch: number;
}

/**
 * 任务开销窗口。状态门：只有 today / overdue / done 进入计算（unscheduled / upcoming → null）；
 * 时间戳非法、无执行日期、或 end < start（坏数据）→ null；end == start 的瞬间窗口合法
 * （由调用方按分钟钳制展示为 1 分钟）。概览「时间投入」按日积分复用本窗口（overviewStats）。
 */
export function taskSpendWindow(
  task: Pick<Task, "startedAt" | "createdAt" | "completedAt" | "scheduledDates"> & { status: TaskStatus },
  now: string,
): TaskSpendWindow | null {
  if (task.status !== "done" && task.status !== "today" && task.status !== "overdue") return null;

  const firstDay = firstScheduledDay(task);
  const lastDay = lastScheduledDay(task);
  if (!firstDay || !lastDay) return null;

  const baseEpoch = parseEpoch(task.startedAt ?? task.createdAt);
  const endCapEpoch = task.completedAt !== null ? parseEpoch(task.completedAt) : parseEpoch(now);
  if (Number.isNaN(baseEpoch) || Number.isNaN(endCapEpoch)) return null;

  // 迁移伪影防御（审查确认项）：旧数据缺 startedAt 时迁移单点回填 updatedAt ?? createdAt，而编辑动作
  // 会刷新 updatedAt——「完成后/逾期末日后又编辑过」的旧任务回填基准会晚于窗口终点，直接判 null 会让
  // 耗时展示与概览投入对这类历史数据静默消失。基准被证伪时回落执行首日 00:00（真实坏数据——
  // 完成时刻早于首日——仍会在下方 end < start 判定中返回 null）
  const effectiveBase =
    baseEpoch > endCapEpoch ? dayStartEpoch(firstDay) : baseEpoch;

  // 起点钳到执行首日 00:00（提前安排的等待期不计）；终点钳到执行末日 24:00（逾期尾巴不计）
  const startEpoch = Math.max(effectiveBase, dayStartEpoch(firstDay));
  const endEpoch = Math.min(endCapEpoch, dayEndEpoch(lastDay));
  if (endEpoch < startEpoch) return null;
  return { startEpoch, endEpoch };
}

/** 阶梯换算（floor）：<1 小时 → 分钟（最小钳 1，不产出 0）；<24 小时 → 小时；≥24 小时 → 天 */
function elapsedBreakdown(durationMs: number): { unit: ElapsedUnit; value: number } {
  if (durationMs < 3_600_000) return { unit: "minute", value: Math.max(1, Math.floor(durationMs / 60_000)) };
  if (durationMs < 86_400_000) return { unit: "hour", value: Math.floor(durationMs / 3_600_000) };
  return { unit: "day", value: Math.floor(durationMs / 86_400_000) };
}

/**
 * 派生任务开销（任务卡 ⏱ 位与编辑抽屉头部共用）。now 以 ISO 字符串注入（纯函数、可测）；
 * 展示位：任务卡元信息行 + 编辑抽屉头部；日历格 chip 不展示（92px 格高预算红线），概览走
 * 时间投入日积分（不走本函数）。i18n 走 DICT 真实词表（tests 连文案值一并锚定）。
 */
export function computeTaskElapsed(
  task: Pick<Task, "startedAt" | "createdAt" | "completedAt" | "scheduledDates"> & { status: TaskStatus },
  now: string,
): TaskElapsed | null {
  const window = taskSpendWindow(task, now);
  if (!window) return null;
  return {
    kind: task.status === "done" ? "spent" : "running",
    ...elapsedBreakdown(window.endEpoch - window.startEpoch),
  };
}

/**
 * 任务卡 ⏱ 位的单单位文案（floor 阶梯，与卡内空间匹配）。
 * 模板约定与 DICT 既有 {n}/{t} 占位符一致。
 */
export function formatTaskElapsed(elapsed: TaskElapsed, lang: Lang): string {
  const duration = t(`elapsed.${elapsed.unit}`, lang).replace("{n}", String(elapsed.value));
  return t(elapsed.kind === "spent" ? "task.elapsedSpent" : "task.elapsedRunning", lang).replace("{t}", duration);
}

/**
 * 复合单位分钟格式化（概览时间投入主数字/气泡共用；区别于单单位 floor——预算/投入需要精度，
 * 「2 小时 15 分」被 floor 成「2 小时」会丢信息）：
 * <1 小时 → N 分钟；<24 小时 → N 小时 M 分（M=0 省略）；≥24 小时 → N 天 M 小时（M=0 省略）。
 * 0 分钟 = 无投入，输出「—」占位（调用方门控渲染）。
 */
export function formatMinutesCompound(minutes: number, lang: Lang): string {
  if (minutes <= 0) return "—";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (lang === "zh-CN") {
    if (days > 0) return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
    if (hours > 0) return `${hours} 小时${mins > 0 ? ` ${mins} 分` : ""}`;
    return `${mins} 分钟`;
  }
  if (days > 0) return `${days} d${hours > 0 ? ` ${hours} h` : ""}`;
  if (hours > 0) return `${hours} h${mins > 0 ? ` ${mins} min` : ""}`;
  return `${mins} min`;
}

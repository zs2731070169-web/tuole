// 任务执行期（2026-10-09 模型改造）：**日期集合**取代旧的「起止连续区间」。
// scheduledDates = 排序去重的 'YYYY-MM-DD' 集合，允许分散（不连续）——支撑用户定调的
// 「日历拖拽只动被拖那一天，其他天完全不动」；空集合 = 未安排。
// 旧 scheduledDate/dueDate 区间由 storage.ts 迁移单点展开为全量日期。
import type { Task } from "./types";
import { addDaysKey, dayKeysInRange, differenceInCalendarDays, fromDateKey, toDateKey } from "../lib/date";

type ScheduledDays = Pick<Task, "scheduledDates">;

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 存储载入归一：非数组 → []；非法键剔除；去重排序（集合契约：升序、无重复） */
export function normalizeScheduledDays(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((d): d is string => typeof d === "string" && DAY_KEY_PATTERN.test(d)))].sort();
}

/** 首个执行日（无 = null）。旧代码里的 scheduledDate 语义都落到这里 */
export function firstScheduledDay(task: ScheduledDays): string | null {
  return task.scheduledDates[0] ?? null;
}

/** 末个执行日（无 = null）。旧 scheduleEnd 语义（单日任务 = 当天自身） */
export function lastScheduledDay(task: ScheduledDays): string | null {
  return task.scheduledDates[task.scheduledDates.length - 1] ?? null;
}

// 旧名保留别名：状态机/统计等大量调用点沿用「结束日」词汇
export const scheduleEnd = lastScheduledDay;

/** 某天是否在执行期内（旧区间 contains 判断的集合版：includes） */
export function scheduledOnDay(task: ScheduledDays, day: string): boolean {
  return task.scheduledDates.includes(day);
}

/** 执行期与 [from, to] 是否有交集（筛选日期范围用；开区间端为 null = 不设限） */
export function scheduledSpanOverlaps(task: ScheduledDays, from: string | null, to: string | null): boolean {
  return task.scheduledDates.some((d) => (!from || d >= from) && (!to || d <= to));
}

/** 执行期是否连续（末-首+1 === 天数）；连续时编辑器展示/落库走区间形态 */
export function isContiguousDays(task: ScheduledDays): boolean {
  const { scheduledDates: dates } = task;
  if (dates.length <= 1) return true;
  const first = fromDateKey(dates[0]);
  const last = fromDateKey(dates[dates.length - 1]);
  return differenceInCalendarDays(last, first) + 1 === dates.length;
}

/** 整体平移（工作台拖拽 / 行内改期 / 顺延的既有语义，保留不变）：
 *  所有日期同步位移，首日精确落到 nextFirst；nextFirst = null = 取消安排（清空集合） */
export function movedSchedule(task: ScheduledDays, nextFirst: string | null): ScheduledDays {
  const dates = task.scheduledDates;
  if (!nextFirst) return { scheduledDates: [] };
  if (dates.length === 0) return { scheduledDates: [nextFirst] };
  const offsetDays = differenceInCalendarDays(fromDateKey(nextFirst), fromDateKey(dates[0]));
  return { scheduledDates: dates.map((d) => addDaysKey(d, offsetDays)) };
}

/** 反向平移：末日的次日语义等场景（保持末日 = nextEnd） */
export function scheduleStartForEnd(task: ScheduledDays, nextEnd: string): string {
  const last = lastScheduledDay(task) ?? nextEnd;
  const offsetDays = differenceInCalendarDays(fromDateKey(nextEnd), fromDateKey(last));
  return addDaysKey(firstScheduledDay(task) ?? nextEnd, offsetDays);
}

/** 逐日移动（2026-10-09 用户定调，日历拖拽落点）：把 fromDay 那一天挪到 toDay，
 *  **其余日期零改动**（执行期可能因此变得分散——这是模型改造的核心目的）；
 *  fromDay 不在集合内 = 无效移动原样返回；toDay 已被覆盖 = 仅移除 fromDay（调用方
 *  drop gate 已拦截覆盖目标，此处防御性兜底） */
export function movedDay(task: ScheduledDays, fromDay: string, toDay: string): string[] {
  if (!task.scheduledDates.includes(fromDay)) return task.scheduledDates;
  const next = task.scheduledDates.filter((d) => d !== fromDay);
  if (!next.includes(toDay)) next.push(toDay);
  return next.sort();
}

/** 顺延基准日 = max(今天, 末个执行日)：今天/逾期任务从今天起推（逾期顺延 = 追赶到目标日）；
 *  未来任务从自身末日起再推一天——若一律按「今天 +1」计算，「明天的任务顺延」目标日仍是
 *  明天，写回同一天视觉上等于 no-op（2026-10-09 用户实测 10月10日任务顺延失效的根因） */
export function rollOverBaseDate(task: ScheduledDays, today: string): string {
  const end = lastScheduledDay(task);
  return end && end > today ? end : today;
}

export function completedDay(task: Pick<Task, "completedAt">): string | null {
  return task.completedAt ? toDateKey(new Date(task.completedAt)) : null;
}

// 日历始终按任务所属日期呈现；完成只改生命周期，不改日期归属。
export function calendarTaskOnDay(
  task: ScheduledDays & Partial<Pick<Task, "completedAt">>,
  day: string,
): boolean {
  return scheduledOnDay(task, day);
}

/** 旧区间键 → 展开为全量日期集合（迁移用；非法键返回 []） */
export function expandLegacySpan(startDate: string, dueDate: string | null): string[] {
  if (!DAY_KEY_PATTERN.test(startDate)) return [];
  const end = dueDate && DAY_KEY_PATTERN.test(dueDate) && dueDate >= startDate ? dueDate : startDate;
  return dayKeysInRange(startDate, end);
}

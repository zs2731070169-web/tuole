// 概览统计派生（纯函数，无 React 依赖）：StatsCard 六格 + 近30天节奏图 + 洞察面板新口径的唯一真相源。
// 组件零内联计算，全部口径在此并受 tests/overviewStats.test.ts 锚定。
import type { TaskView } from "./types";
import {
  addDays,
  addDaysKey,
  differenceInCalendarDays,
  endOfWeek,
  fromDateKey,
  startOfWeek,
  toDateKey,
  todayKey,
} from "../lib/date";
import { completedDay, scheduleEnd, scheduledOnDay } from "./taskDates";

export interface OverviewStats {
  // —— 既有口径（StatsCard 六格 + 节奏图）——
  total: number; // 全部任务数
  totalDone: number; // 已完成总数（有 completedAt 即视为已结束）
  overdue: number; // 逾期数
  unscheduled: number; // 未安排数
  active: number; // 进行中 = 今天 + 未来安排（不含未安排）
  weekCompleted: number; // 本周（周一起）完成数
  monthCompleted: number; // 近30天（含今天）完成数
  daily: number[]; // 近30天每日完成数，槽位与 dailyKeys 对齐（i=0 = 29 天前，i=29 = 今天）
  dailyKeys: string[]; // 各槽位日期键
  peak: number; // daily 峰值（无数据时为 1，避免除零）
  // —— 洞察面板：按期完成率 ——
  onTimeRate: number | null; // 按期完成百分比（0–100）；无可判定任务为 null
  onTimeCount: number; // 按期完成数
  onTimeJudged: number; // 可判定分母（无执行期基准的已完成任务不计入）
  // —— 洞察面板：逾期账龄 ——
  overdueAgeBuckets: [number, number, number]; // 账龄桶计数：1–3 天 / 4–7 天 / ≥8 天
  overdueMaxAgeDays: number | null; // 最长账龄天数；无逾期为 null
  // —— 洞察面板：未安排积压 ——
  staleUnscheduledCount: number; // 停靠超过 7 天（≥8 天）的未安排任务数
  // —— 洞察面板：未来 7 天负载 ——
  upcomingLoadDays: { key: string; count: number }[]; // 今天起含今天共 7 天，count = 活动任务执行期覆盖该日
  // —— 洞察面板：本周环比 ——
  lastWeekCompleted: number; // 上周完成数
  weekDeltaPercent: number | null; // 环比百分比（+/-，四舍五入）；上周为 0 时 null（不给 ±∞）
  // —— 洞察面板：近30天新建 vs 完成（剪刀差）——
  createdIn30: number; // 近30天新建数（含已完成，按 createdAt）
  netFlow30: number; // 净差 = 新建 − 完成（正数 = 待办在积压）
  // —— 洞察面板：未结优先级分布 ——
  priorityMix: { high: number; medium: number; low: number; none: number }; // 未完成任务的优先级计数
}

// 逾期账龄桶边界：≤3 天 / ≤7 天 / 更久
const OVERDUE_AGE_RECENT_MAX = 3;
const OVERDUE_AGE_WEEK_MAX = 7;
// 未安排积压阈值：停靠超过 7 天（含第 8 天）视为积压
const STALE_UNSCHEDULED_MIN_DAYS = 8;

export function computeOverviewStats(views: TaskView[], now: Date): OverviewStats {
  const today = todayKey(now);
  const weekStart = toDateKey(startOfWeek(now, { weekStartsOn: 1 }));
  const weekEnd = toDateKey(endOfWeek(now, { weekStartsOn: 1 }));
  // 上周窗口：任取上周内一天为锚点取其所在周（周一起算）
  const lastWeekAnchor = addDays(now, -7);
  const lastWeekStart = toDateKey(startOfWeek(lastWeekAnchor, { weekStartsOn: 1 }));
  const lastWeekEnd = toDateKey(endOfWeek(lastWeekAnchor, { weekStartsOn: 1 }));
  const monthStart = toDateKey(addDays(now, -29));

  // 近 30 天每日完成数（含今天）：i=0 = 29 天前（最左），i=29 = 今天（最右）
  const daily: number[] = Array.from({ length: 30 }, () => 0);
  const dailyKeys: string[] = Array.from({ length: 30 }, (_, i) => toDateKey(addDays(now, -(29 - i))));
  // 未来 7 天负载槽位（今天起含今天）
  const upcomingLoadDays = Array.from({ length: 7 }, (_, i) => ({ key: addDaysKey(today, i), count: 0 }));

  let weekCompleted = 0;
  let monthCompleted = 0;
  let lastWeekCompleted = 0;
  let onTimeCount = 0;
  let onTimeJudged = 0;
  let createdIn30 = 0;
  let staleUnscheduledCount = 0;
  let overdueMaxAgeDays: number | null = null;
  const overdueAgeBuckets: [number, number, number] = [0, 0, 0];
  const priorityMix = { high: 0, medium: 0, low: 0, none: 0 };

  for (const v of views) {
    // —— 完成侧：周/月窗口、节奏槽位、环比、按期判定 ——
    if (v.completedAt) {
      const day = completedDay(v)!;
      if (day >= monthStart && day <= today) {
        monthCompleted += 1;
        const idx = differenceInCalendarDays(fromDateKey(day), fromDateKey(monthStart));
        if (idx >= 0 && idx < 30) daily[idx] += 1;
      }
      if (day >= weekStart && day <= weekEnd) weekCompleted += 1;
      else if (day >= lastWeekStart && day <= lastWeekEnd) lastWeekCompleted += 1;

      // 按期判定：基准 = 执行期结束日（dueDate ?? scheduledDate）；无基准的历史/导入数据不入分母
      const baseline = scheduleEnd(v);
      if (baseline) {
        onTimeJudged += 1;
        if (day <= baseline) onTimeCount += 1;
      }
    } else {
      // —— 未结侧：未来负载（执行期覆盖记数）+ 优先级分布 ——
      for (const slot of upcomingLoadDays) {
        if (scheduledOnDay(v, slot.key)) slot.count += 1;
      }
      priorityMix[v.priority] += 1;
    }

    // —— 创建侧：近30天剪刀差（含已完成任务）——
    const createdDayKey = toDateKey(new Date(v.createdAt));
    if (createdDayKey >= monthStart && createdDayKey <= today) createdIn30 += 1;

    // —— 逾期账龄：按执行期结束日距今天数分桶（逾期状态保证有基准，防御性跳过缺失）——
    if (v.status === "overdue") {
      const end = scheduleEnd(v);
      if (end) {
        const age = Math.max(1, differenceInCalendarDays(fromDateKey(today), fromDateKey(end)));
        if (age <= OVERDUE_AGE_RECENT_MAX) overdueAgeBuckets[0] += 1;
        else if (age <= OVERDUE_AGE_WEEK_MAX) overdueAgeBuckets[1] += 1;
        else overdueAgeBuckets[2] += 1;
        overdueMaxAgeDays = Math.max(overdueMaxAgeDays ?? 0, age);
      }
    }

    // —— 未安排积压：停靠日缺失兜底 createdAt 日期 ——
    if (v.status === "unscheduled") {
      const parkedKey = v.parkedDate ?? toDateKey(new Date(v.createdAt));
      const parkedDays = differenceInCalendarDays(fromDateKey(today), fromDateKey(parkedKey));
      if (parkedDays >= STALE_UNSCHEDULED_MIN_DAYS) staleUnscheduledCount += 1;
    }
  }

  return {
    total: views.length,
    totalDone: views.filter((v) => v.completedAt).length,
    overdue: views.filter((v) => v.status === "overdue").length,
    unscheduled: views.filter((v) => v.status === "unscheduled").length,
    // 「进行中」= 今天 + 未来安排，未安排单独成格（与筛选栏 ACTIVE_STATUSES 同口径）
    active: views.filter((v) => v.status === "today" || v.status === "upcoming").length,
    weekCompleted,
    monthCompleted,
    daily,
    dailyKeys,
    peak: Math.max(1, ...daily),
    onTimeRate: onTimeJudged === 0 ? null : Math.round((onTimeCount / onTimeJudged) * 100),
    onTimeCount,
    onTimeJudged,
    overdueAgeBuckets,
    overdueMaxAgeDays,
    staleUnscheduledCount,
    upcomingLoadDays,
    lastWeekCompleted,
    weekDeltaPercent:
      lastWeekCompleted === 0 ? null : Math.round(((weekCompleted - lastWeekCompleted) / lastWeekCompleted) * 100),
    createdIn30,
    netFlow30: createdIn30 - monthCompleted,
    priorityMix,
  };
}

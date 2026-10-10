// 概览统计派生（纯函数，无 React 依赖）：StatsCard 五格 + 时间投入自然月网格的唯一真相源。
// 组件零内联计算，全部口径在此并受 tests/overviewStats.test.ts 锚定。
// 洞察六指标（按期率/环比/账龄/优先级/负载/剪刀差）与节奏图已于 2026-10-10 随用户决策下线，勿加回。
import type { TaskView } from "./types";
import { addDaysKey, todayKey, fromDateKey } from "../lib/date";
import { taskSpendWindow } from "./taskElapsed";

export interface OverviewStats {
  // —— StatsCard 五格 + 总体完成进度 ——
  total: number; // 全部任务数
  totalDone: number; // 已完成总数（有 completedAt 即视为已结束）
  overdue: number; // 逾期数
  unscheduled: number; // 未安排数
  active: number; // 进行中 = 今天 + 未来安排（不含未安排）
}

export function computeOverviewStats(views: TaskView[]): OverviewStats {
  return {
    total: views.length,
    totalDone: views.filter((v) => v.completedAt).length,
    overdue: views.filter((v) => v.status === "overdue").length,
    unscheduled: views.filter((v) => v.status === "unscheduled").length,
    // 「进行中」= 今天 + 未来安排，未安排单独成格（与筛选栏 ACTIVE_STATUSES 同口径）
    active: views.filter((v) => v.status === "today" || v.status === "upcoming").length,
  };
}

/** 时间投入（概览唯一洞察块）：**自然月网格**（1 日 → 月末），按日积分各任务的开销窗口 */
export interface MonthInvestmentStats {
  monthKey: string; // "YYYY-MM"；缺省/非法/未来月回退当前月（复盘只能看过去）
  dailyKeys: string[]; // 1 日 → 月末，正序（i = 日号 − 1）
  dailyMinutes: number[]; // 各日投入分钟数（窗口 ∩ 当日 [00:00, 24:00) 毫秒积分后 floor）；未来日恒 0
  totalMinutes: number; // 本月合计
  avgMinutes: number; // 日均：当前月 = round(合计 / 已过天数（含今天)）；历史月 = round(合计 / 当月天数)
  todayMinutes: number; // 今日投入（仅当前月有意义，历史月恒 0）
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * 时间投入自然月网格（2026-10-10 用户决策：滚动 30 天窗口与「月底复盘」心智对不上）。
 * 含进行中任务的当日部分（窗口终点 = now）；逾期尾巴与月外日期零贡献；跨月窗口分别落入各自月份。
 */
export function computeMonthInvestment(views: TaskView[], now: Date, monthKey?: string): MonthInvestmentStats {
  const today = todayKey(now);
  const currentMonth = today.slice(0, 7);
  // 缺省 / 非法 / 未来月 → 回退当前月（未来无可复盘）
  const month = !monthKey || !MONTH_KEY_PATTERN.test(monthKey) || monthKey > currentMonth ? currentMonth : monthKey;

  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const dailyKeys = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  // 各槽日的 [00:00, 24:00) 边界（本地时区，epoch 毫秒）。终点用真实次日本地零点而非固定 +24h——
  // DST 切换日真实日长为 23/25 小时，固定偏移会让相邻桶重叠或留缝（与 taskSpendWindow 同口径）
  const dayBounds = dailyKeys.map((key) => ({
    start: fromDateKey(key).getTime(),
    end: fromDateKey(addDaysKey(key, 1)).getTime(),
  }));
  const investMs: number[] = Array.from({ length: daysInMonth }, () => 0);

  for (const v of views) {
    // —— 时间投入：开销窗口 ∩ 各日切分累加（毫秒），最后统一 floor 成分钟 ——
    const window = taskSpendWindow(v, now.toISOString());
    if (!window) continue;
    for (let i = 0; i < daysInMonth; i++) {
      const overlap = Math.min(window.endEpoch, dayBounds[i].end) - Math.max(window.startEpoch, dayBounds[i].start);
      if (overlap > 0) investMs[i] += overlap;
    }
  }

  const dailyMinutes = investMs.map((ms) => Math.floor(ms / 60_000));
  const totalMinutes = dailyMinutes.reduce((sum, m) => sum + m, 0);
  const isCurrentMonth = month === currentMonth;
  // 日均分母：当前月 = 已过天数（含今天，月中看才不失真）；历史月 = 当月天数（整月复盘）
  const elapsedDays = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth;

  return {
    monthKey: month,
    dailyKeys,
    dailyMinutes,
    totalMinutes,
    avgMinutes: Math.round(totalMinutes / Math.max(1, elapsedDays)),
    todayMinutes: isCurrentMonth ? dailyMinutes[elapsedDays - 1] : 0,
  };
}

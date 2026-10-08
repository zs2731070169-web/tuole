// 日期工具：统一以 'YYYY-MM-DD' 日期键比较，避免时区/时分秒干扰状态判定
import { format, parseISO, addDays, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, differenceInCalendarDays } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";

export function todayKey(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

export function toDateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function fromDateKey(key: string): Date {
  return parseISO(`${key}T00:00:00`);
}

// 比较两个日期键：<0 a早, 0 相同, >0 a晚
export function compareDateKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function addDaysKey(key: string, n: number): string {
  return toDateKey(addDays(fromDateKey(key), n));
}

// 含首尾两端的日期键闭区间（起始/结束顺序任意，自动归一）：日历删除模式 Shift 连选日期用。
// 非法日期键返回空数组，调用方无需额外防御
export function dayKeysInRange(startKey: string, endKey: string): string[] {
  const [from, to] =
    compareDateKeys(startKey, endKey) <= 0
      ? [fromDateKey(startKey), fromDateKey(endKey)]
      : [fromDateKey(endKey), fromDateKey(startKey)];
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  return eachDayOfInterval({ start: from, end: to }).map(toDateKey);
}

// 顺延目标：明天 / 下一个工作日（跳过周六日）
export function rollOverTarget(fromToday: string, target: "tomorrow" | "nextWeekday"): string {
  if (target === "tomorrow") return addDaysKey(fromToday, 1);
  let d = fromDateKey(addDaysKey(fromToday, 1));
  while (d.getDay() === 0 || d.getDay() === 6) {
    d = addDays(d, 1);
  }
  return toDateKey(d);
}

export function localeObj(lang: "zh-CN" | "en-US") {
  return lang === "zh-CN" ? zhCN : enUS;
}

export function friendlyDate(key: string | null, lang: "zh-CN" | "en-US", now: Date = new Date()): string {
  if (!key) return "";
  const diff = differenceInCalendarDays(fromDateKey(key), fromDateKey(todayKey(now)));
  if (diff === 0) return lang === "zh-CN" ? "今天" : "Today";
  if (diff === 1) return lang === "zh-CN" ? "明天" : "Tomorrow";
  if (diff === -1) return lang === "zh-CN" ? "昨天" : "Yesterday";
  return format(fromDateKey(key), "M月d日", { locale: localeObj(lang) });
}

// 日历月视图格子：固定 6 行（42 格），避免 5 周/月与 6 周/月切换时整页高度变化，
// 从而让日历轮播不会触发页面滚动槽和其他工具栏的横向布局跳动。
export function monthGrid(monthDate: Date): Date[] {
  const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end: addDays(start, 41) });
}

// 月份轮播共用一条连续的周轨道。相邻月份的 42 天视窗本来会重叠 1–2 周；
// 这里只生成一次日期，再给出各月份视窗在轨道上的起始行，避免接缝处重复绘制。
export function monthCarouselWindow(monthDate: Date): {
  days: Date[];
  currentRow: number;
  nextRow: number;
} {
  const previous = monthGrid(addMonths(monthDate, -1));
  const current = monthGrid(monthDate);
  const next = monthGrid(addMonths(monthDate, 1));
  const start = previous[0];
  const days = eachDayOfInterval({ start, end: next[next.length - 1] });
  return {
    days,
    currentRow: differenceInCalendarDays(current[0], start) / 7,
    nextRow: differenceInCalendarDays(next[0], start) / 7,
  };
}


export { isSameMonth, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, differenceInCalendarDays };

// 筛选组合逻辑：applyFilters 纯函数，前端与测试共用
// 关键约束：筛选只改变「展示」，绝不改变任何任务状态
import type { TaskView, FilterState, TaskStatus } from "./types";
import { isActive } from "./statusMachine";
import { toDateKey } from "../lib/date";
import { scheduledSpanOverlaps } from "./taskDates";

function matchStatus(status: TaskStatus, filter: FilterState["status"]): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return isActive(status);
    case "overdue":
      return status === "overdue";
    case "unscheduled":
      return status === "unscheduled";
    case "done":
      return status === "done";
    default:
      return true;
  }
}

function matchKeyword(task: TaskView, kw: string): boolean {
  if (!kw.trim()) return true;
  const q = kw.trim().toLowerCase();
  return (
    task.title.toLowerCase().includes(q) ||
    task.note.toLowerCase().includes(q)
  );
}

function matchDateRange(task: TaskView, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  // 日期范围匹配「执行期」**或**「完成日」，任一命中即展示：
  // 已结束任务额外按 completedAt 命中——工作台已完成栏按完成日分组，
  // 若只看安排日会出现「本周完成的任务被本周范围滤掉」的自相矛盾。
  const inRange = (dayKey: string | null) => {
    if (!dayKey) return false;
    if (from && dayKey < from) return false;
    if (to && dayKey > to) return false;
    return true;
  };
  const finishedStamp = task.completedAt;
  const finishedDay = finishedStamp ? toDateKey(new Date(finishedStamp)) : null;
  // 未安排且未结束的任务没有任何日期，在设了范围时不展示
  return scheduledSpanOverlaps(task, from, to) || inRange(finishedDay);
}

export function applyFilters(tasks: TaskView[], f: FilterState): TaskView[] {
  return tasks.filter((t) => {
    if (!matchStatus(t.status, f.status)) return false;
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (!matchDateRange(t, f.dateFrom, f.dateTo)) return false;
    if (!matchKeyword(t, f.keyword)) return false;
    return true;
  });
}

export function hasActiveFilter(f: FilterState): boolean {
  return (
    f.status !== "all" ||
    f.priorities.length > 0 ||
    !!f.dateFrom ||
    !!f.dateTo ||
    f.keyword.trim() !== ""
  );
}

export const EMPTY_FILTER: FilterState = {
  status: "all",
  priorities: [],
  dateFrom: null,
  dateTo: null,
  keyword: "",
};

export type SortKey = "scheduledDate" | "createdAt" | "priority" | "custom";

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };

export function sortTasks(tasks: TaskView[], key: SortKey): TaskView[] {
  const arr = [...tasks];
  switch (key) {
    case "scheduledDate":
      return arr.sort((a, b) => {
        if (!a.scheduledDate) return 1;
        if (!b.scheduledDate) return -1;
        return a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : 0;
      });
    case "createdAt":
      return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "priority":
      return arr.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    case "custom":
    default:
      return arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

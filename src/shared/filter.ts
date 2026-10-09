// 筛选组合逻辑：applyFilters 纯函数，前端与测试共用
// 关键约束：筛选只改变「展示」，绝不改变任何任务状态
import type { TaskView, FilterState, TaskStatus } from "./types";
import { isActive } from "./statusMachine";
import { firstScheduledDay, scheduledSpanOverlaps } from "./taskDates";

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
  // 日期筛选始终只匹配任务所属日期；完成状态不能把任务换到另一天。
  return scheduledSpanOverlaps(task, from, to);
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
      // 执行期模型改造后按「首个执行日」排序（集合可能分散，首日是最稳的排序锚点）
      return arr.sort((a, b) => {
        const aFirst = firstScheduledDay(a);
        const bFirst = firstScheduledDay(b);
        if (!aFirst) return 1;
        if (!bFirst) return -1;
        return aFirst < bFirst ? -1 : aFirst > bFirst ? 1 : 0;
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

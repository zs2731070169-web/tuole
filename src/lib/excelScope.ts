import type { FilterState, Task, TaskView, ViewMode } from "../shared/types";
import { computeAutoStatus } from "../shared/statusMachine";
import { applyFilters } from "../shared/filter";
import { bucketWorkbenchColumns } from "../shared/workbench";
import { monthGrid, toDateKey, todayKey } from "./date";
import { calendarTaskOnDay, scheduledSpanOverlaps } from "../shared/taskDates";

interface ExportScope {
  tasks: Task[];
  fileName: string;
}

/** 单日/月导出包含该日期范围的任务及未安排任务；不把派生 status 写进文件。
 *  文件名 = 妥了任务_{视图标签}_{日期锚点}_{导出时刻}（2026-10 用户决策）：视图标签
 *  （概览/日历/工作台）区分三视图同日导出的重名，导出时刻（HHmm）区分同视图同日多次导出。 */

// 导出时刻（本地时区 HHmm，随 options.now 取值）；时间口径对齐备份文件名 tuole-backup-…-HHmm
function localTimeOfDay(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

export function selectTasksForExcel(
  tasks: Task[],
  options: {
    view: ViewMode;
    filter: FilterState;
    calendarDay: string | null;
    calendarAnchor: Date;
    workbenchDay: string;
    now?: Date;
  },
): ExportScope {
  const now = options.now ?? new Date();
  const clock = localTimeOfDay(now);
  const views: TaskView[] = tasks
    .filter((task) => task.title.trim() !== "")
    .map((task) => ({ ...task, status: computeAutoStatus(task, { now }) }));

  if (options.view === "calendar") {
    const filtered = applyFilters(views, { ...options.filter, priorities: [] });
    // 月份切换后 store 可能还留着上个月的选中格；只以当前网格里可见的格子作为单日导出范围。
    const day = options.calendarDay && monthGrid(options.calendarAnchor).some((date) => toDateKey(date) === options.calendarDay)
      ? options.calendarDay
      : null;
    const month = toDateKey(options.calendarAnchor).slice(0, 7);
    const selected = filtered.filter((task) =>
      day
        ? calendarTaskOnDay(task, day)
        : scheduledSpanOverlaps(task, `${month}-01`, `${month}-31`),
    );
    return {
      tasks: selected,
      fileName: `妥了任务_日历_${day ?? month}_${clock}.xlsx`,
    };
  }

  if (options.view === "workbench") {
    const filtered = applyFilters(views, {
      ...options.filter,
      status: "all",
      dateFrom: null,
      dateTo: null,
    });
    const columns = bucketWorkbenchColumns(filtered, options.workbenchDay, todayKey(now));
    return {
      tasks: [...columns.unscheduled, ...columns.dayList, ...columns.doneOnDay],
      fileName: `妥了任务_工作台_${options.workbenchDay}_${clock}.xlsx`,
    };
  }

  return {
    tasks: applyFilters(views, options.filter),
    fileName: `妥了任务_概览_${todayKey(now)}_${clock}.xlsx`,
  };
}

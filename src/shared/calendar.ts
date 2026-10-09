// 日历「按日期删除」的范围规划（2026-10-10 语义升级：按日修剪，与拖拽「只动那一天」同模型）。
// 刻意接收原始 tasks 而非筛选后的 TaskView，确保删除范围不受当前搜索/状态/日期筛选影响。
import type { Task } from "./types";

export interface DayPrunePlan {
  // 整条删除的任务 id：所属日期全部被选中（含历史空日期停靠任务）
  deleteIds: string[];
  // 保留任务、仅从执行期移除所选日期（多天任务删其中几天；scheduledDates = 修剪后的剩余日期）
  prunes: { id: string; scheduledDates: string[] }[];
}

/**
 * 规划「删除所选日期」的影响（2026-10-10 用户决策：删一天只移除那一天，其余日期不连带）：
 * - 多天任务覆盖所选日：从 scheduledDates 里移除这些日，任务保留；
 * - 所属日期全部命中，或历史空日期任务的停靠日命中：整条删除。
 * draft 任务不进规划（与列表渲染同口径，由草稿回收链路处理）。
 */
export function planDeleteDaysPrune(
  tasks: readonly (Pick<Task, "id" | "scheduledDates" | "completedAt"> &
    Partial<Pick<Task, "parkedDate" | "draft">>)[],
  days: readonly string[],
  today: string,
): DayPrunePlan {
  if (days.length === 0) return { deleteIds: [], prunes: [] };
  const daySet = new Set(days);
  const deleteIds: string[] = [];
  const prunes: { id: string; scheduledDates: string[] }[] = [];

  for (const task of tasks) {
    if (task.draft === true) continue; // 草稿不入任何列表/删除范围，由回收链路处理
    if (task.scheduledDates.length === 0) {
      // 未安排按停靠日归属：命中即整条删除（单日停靠的存在形态）
      if (daySet.has(task.parkedDate ?? today)) deleteIds.push(task.id);
      continue;
    }
    // 任何生命周期都按所属日期修剪：移除所选日；剩余为空 → 整条删除
    const remaining = task.scheduledDates.filter((day) => !daySet.has(day));
    if (remaining.length === task.scheduledDates.length) continue; // 未命中任何所选日
    if (remaining.length === 0) {
      deleteIds.push(task.id);
    } else {
      prunes.push({ id: task.id, scheduledDates: remaining });
    }
  }
  return { deleteIds, prunes };
}

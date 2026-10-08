import type { Task } from "./types";
import { calendarTaskOnDay } from "./taskDates";

/**
 * 返回安排在指定日期集合内的任务 id。
 *
 * 日历按执行期（已完成任务按完成日）组织任务；这里刻意接收原始 tasks，而不是筛选后的 TaskView，
 * 确保“按日期删除”不会因为当前搜索/状态/日期范围筛选而漏删同一天的任务。
 */
export function taskIdsOnScheduledDays(
  tasks: readonly (Pick<Task, "id" | "scheduledDate"> & Partial<Pick<Task, "dueDate" | "completedAt">>)[],
  days: readonly string[],
): string[] {
  if (days.length === 0) return [];
  const uniqueDays = [...new Set(days)];
  return tasks.filter((task) => uniqueDays.some((day) => calendarTaskOnDay(task, day))).map((task) => task.id);
}

/**
 * 返回停靠在指定日期集合内的「未安排」任务 id（日历按日期删除模式的补充范围）。
 *
 * 口径与工作台「未安排」栏一致：scheduledDate 为空且未完成的活动任务，停靠日 =
 * parkedDate（缺失兜底今天，today 由调用方注入保持纯函数）。未安排跟着停靠日走、
 * 按日隔离——「未安排 N」开关的计数与删除范围都只覆盖所选日期上停靠的未安排
 * （2026-10 用户决策：全局并入的计数与所选日期无关，口径不对，已废弃）；无选中
 * 日期时无停靠命中，开关不出现（「只勾未安排、不选日期独立清空」的旧全局口径随之废弃）。
 */
export function unscheduledTaskIdsParkedOnDays(
  tasks: readonly (Pick<Task, "id" | "scheduledDate" | "completedAt"> &
    Partial<Pick<Task, "parkedDate">>)[],
  days: readonly string[],
  today: string,
): string[] {
  if (days.length === 0) return [];
  const daySet = new Set(days);
  return tasks
    .filter(
      (task) =>
        task.scheduledDate === null && task.completedAt === null && daySet.has(task.parkedDate ?? today),
    )
    .map((task) => task.id);
}

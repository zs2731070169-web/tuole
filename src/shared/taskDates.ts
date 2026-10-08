// 任务执行期：安排日是起点，截止日是可选终点（含当天）。
// 未设终点的旧任务与新单日任务都只占安排日当天。
import type { Task } from "./types";
import { addDaysKey, differenceInCalendarDays, fromDateKey, toDateKey } from "../lib/date";

type ScheduledSpan = Pick<Task, "scheduledDate"> & Partial<Pick<Task, "dueDate">>;

export function scheduleEnd(task: ScheduledSpan): string | null {
  if (!task.scheduledDate) return null;
  return task.dueDate && task.dueDate >= task.scheduledDate ? task.dueDate : task.scheduledDate;
}

export function scheduledOnDay(task: ScheduledSpan, day: string): boolean {
  const end = scheduleEnd(task);
  return !!task.scheduledDate && !!end && task.scheduledDate <= day && day <= end;
}

export function scheduledSpanOverlaps(task: ScheduledSpan, from: string | null, to: string | null): boolean {
  const end = scheduleEnd(task);
  if (!task.scheduledDate || !end) return false;
  return (!from || end >= from) && (!to || task.scheduledDate <= to);
}

// 行内改期/拖拽移动整个执行期，保留原跨度；取消安排时清除终点。
export function movedSchedule(task: ScheduledSpan, nextStart: string | null): ScheduledSpan {
  if (!nextStart) return { scheduledDate: null, dueDate: null };
  const spanDays = scheduleLengthDays(task);
  return {
    scheduledDate: nextStart,
    dueDate: spanDays > 0 ? addDaysKey(nextStart, spanDays) : null,
  };
}

export function scheduleStartForEnd(task: ScheduledSpan, nextEnd: string): string {
  return addDaysKey(nextEnd, -scheduleLengthDays(task));
}

function scheduleLengthDays(task: ScheduledSpan): number {
  const end = scheduleEnd(task);
  return task.scheduledDate && end
    ? differenceInCalendarDays(fromDateKey(end), fromDateKey(task.scheduledDate))
    : 0;
}

export function completedDay(task: Pick<Task, "completedAt">): string | null {
  return task.completedAt ? toDateKey(new Date(task.completedAt)) : null;
}

// 日历已完成任务按完成日呈现；活动任务覆盖执行期内的每一天。
export function calendarTaskOnDay(
  task: ScheduledSpan & Partial<Pick<Task, "completedAt">>,
  day: string,
): boolean {
  const finished = task.completedAt ? completedDay({ completedAt: task.completedAt }) : null;
  return finished ? finished === day : scheduledOnDay(task, day);
}

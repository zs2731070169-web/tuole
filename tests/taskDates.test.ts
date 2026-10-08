import { describe, expect, it } from "vitest";
import { calendarTaskOnDay, movedSchedule, scheduleStartForEnd, scheduledOnDay } from "../src/shared/taskDates";
import { useTaskStore } from "../src/stores/useTaskStore";
import type { Task } from "../src/shared/types";

describe("任务执行期", () => {
  it("单日任务只覆盖起始日；跨月区间含两端", () => {
    expect(scheduledOnDay({ scheduledDate: "2026-10-08", dueDate: null }, "2026-10-09")).toBe(false);
    const span = { scheduledDate: "2026-10-30", dueDate: "2026-11-02" };
    expect(scheduledOnDay(span, "2026-10-30")).toBe(true);
    expect(scheduledOnDay(span, "2026-11-01")).toBe(true);
    expect(scheduledOnDay(span, "2026-11-02")).toBe(true);
    expect(scheduledOnDay(span, "2026-11-03")).toBe(false);
  });

  it("改期保留跨度，取消安排清除起止日期", () => {
    const span = { scheduledDate: "2026-10-30", dueDate: "2026-11-02" };
    expect(movedSchedule(span, "2026-11-05")).toEqual({ scheduledDate: "2026-11-05", dueDate: "2026-11-08" });
    expect(movedSchedule(span, null)).toEqual({ scheduledDate: null, dueDate: null });
    expect(scheduleStartForEnd(span, "2026-10-07")).toBe("2026-10-04");
  });

  it("已完成任务只在完成日出现在日历", () => {
    const done = { scheduledDate: "2026-10-05", dueDate: "2026-10-09", completedAt: "2026-10-07T12:00:00" };
    expect(calendarTaskOnDay(done, "2026-10-05")).toBe(false);
    expect(calendarTaskOnDay(done, "2026-10-07")).toBe(true);
  });

  it("store 行内改期保留跨度，取消安排后清除终点", () => {
    const task: Task = {
      id: "span", title: "跨天任务", note: "", priority: "none",
      scheduledDate: "2026-10-05", dueDate: "2026-10-09", parkedDate: null,
      subtasks: [],      createdAt: "2026-10-01T00:00:00", completedAt: null, completedReason: null, sortOrder: 0,
    };
    useTaskStore.setState({ tasks: [task] });
    useTaskStore.getState().scheduleTo(task.id, "2026-10-08");
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ scheduledDate: "2026-10-08", dueDate: "2026-10-12" });
    useTaskStore.getState().scheduleTo(task.id, null, "2026-10-08");
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ scheduledDate: null, dueDate: null, parkedDate: "2026-10-08" });
  });
});

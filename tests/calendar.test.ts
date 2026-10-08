import { beforeEach, describe, expect, it } from "vitest";
import { taskIdsOnScheduledDays, unscheduledTaskIdsParkedOnDays } from "../src/shared/calendar";
import { useCalendarStore } from "../src/stores/useCalendarStore";
import { todayKey } from "../src/lib/date";

describe("taskIdsOnScheduledDays", () => {
  const tasks = [
    { id: "a", scheduledDate: "2026-10-07" },
    { id: "b", scheduledDate: "2026-10-07" },
    { id: "c", scheduledDate: "2026-10-08" },
    { id: "d", scheduledDate: null },
  ];

  it("单日返回当天全部任务，不包含未安排任务", () => {
    expect(taskIdsOnScheduledDays(tasks, ["2026-10-07"])).toEqual(["a", "b"]);
  });

  it("多日合并任务且不受重复日期影响", () => {
    expect(taskIdsOnScheduledDays(tasks, ["2026-10-07", "2026-10-08", "2026-10-07"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("跨天任务命中覆盖日期且只删除一次；已完成任务按完成日归属", () => {
    const span = { id: "span", scheduledDate: "2026-10-05", dueDate: "2026-10-09", completedAt: null };
    const done = { id: "done", scheduledDate: "2026-10-05", dueDate: "2026-10-09", completedAt: "2026-10-10T08:00:00" };
    expect(taskIdsOnScheduledDays([span, done], ["2026-10-07", "2026-10-08"])).toEqual(["span"]);
    expect(taskIdsOnScheduledDays([span, done], ["2026-10-10"])).toEqual(["done"]);
  });
});

describe("calendar delete selection", () => {
  beforeEach(() => {
    // deleteAnchorDay 一并复位：zustand 单例跨测试文件共享，字段泄漏会让其他文件的用例依赖执行顺序
    useCalendarStore.setState({
      deleteMode: false,
      deleteDays: [],
      deleteAnchorDay: null,
    });
  });

  it("进入模式后可切换一个或多个日期，取消时清空", () => {
    const store = useCalendarStore.getState();
    store.startDeleteMode();
    expect(useCalendarStore.getState()).toMatchObject({ deleteMode: true, deleteDays: [] });

    useCalendarStore.getState().toggleDeleteDay("2026-10-07");
    useCalendarStore.getState().toggleDeleteDay("2026-10-08");
    expect(useCalendarStore.getState().deleteDays).toEqual(["2026-10-07", "2026-10-08"]);

    useCalendarStore.getState().toggleDeleteDay("2026-10-07");
    expect(useCalendarStore.getState().deleteDays).toEqual(["2026-10-08"]);

    useCalendarStore.getState().cancelDeleteMode();
    expect(useCalendarStore.getState()).toMatchObject({ deleteMode: false, deleteDays: [] });
  });

  it("选格删除范围连带停靠未安排：taskIdsOnScheduledDays ∪ unscheduledTaskIdsParkedOnDays（2026-10 口径）", () => {
    // 组件层（CalendarLeadingBar）的组合口径锚点：选中日期格 = 执行期覆盖该日的任务 + 停靠该日的未安排
    const tasks = [
      { id: "s1", scheduledDate: "2026-10-08", completedAt: null },
      { id: "u1", scheduledDate: null, completedAt: null, parkedDate: "2026-10-08" },
      { id: "u2", scheduledDate: null, completedAt: null, parkedDate: "2026-10-09" },
    ];
    const scope = [
      ...taskIdsOnScheduledDays(tasks, ["2026-10-08"]),
      ...unscheduledTaskIdsParkedOnDays(tasks, ["2026-10-08"], todayKey()),
    ];
    expect(scope.sort()).toEqual(["s1", "u1"]);
  });
});

describe("unscheduledTaskIdsParkedOnDays（删除模式的未安排补充范围，按停靠日收窄）", () => {
  const today = "2026-10-08";
  const tasks = [
    { id: "a", scheduledDate: null, completedAt: null, parkedDate: "2026-10-08" }, // 停靠所选日 ✓
    { id: "b", scheduledDate: "2026-10-08", completedAt: null, parkedDate: null }, // 已排期 ✗
    { id: "c", scheduledDate: null, completedAt: "2026-10-06T10:00:00.000Z", parkedDate: "2026-10-08" }, // 已完成未安排 ✗
    { id: "d", scheduledDate: null, completedAt: null, parkedDate: "2026-10-11" }, // 停靠别日 ✗
    { id: "e", scheduledDate: null, completedAt: null, parkedDate: null }, // 无停靠日，兜底今天 ✓
  ];

  it("只收停靠在所选日期上的活动未安排任务（parkedDate 缺失兜底今天）", () => {
    expect(unscheduledTaskIdsParkedOnDays(tasks, ["2026-10-08"], today)).toEqual(["a", "e"]);
  });

  it("多日选中 = 各日停靠命中并集", () => {
    expect(unscheduledTaskIdsParkedOnDays(tasks, ["2026-10-11", "2026-10-08"], today)).toEqual([
      "a",
      "d",
      "e",
    ]);
  });

  it("无选中日期 = 空范围（开关不出现）", () => {
    expect(unscheduledTaskIdsParkedOnDays(tasks, [], today)).toEqual([]);
  });
});

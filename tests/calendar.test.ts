import { beforeEach, describe, expect, it } from "vitest";
import { canDropTaskOnCalendarDay, canOpenCalendarDay, planDeleteDaysPrune } from "../src/shared/calendar";
import { useCalendarStore } from "../src/stores/useCalendarStore";
import { useTaskStore, emptyTask } from "../src/stores/useTaskStore";
import { todayKey } from "../src/lib/date";

const OCT5_9 = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];

describe("canOpenCalendarDay 日历格进入工作台门禁", () => {
  const today = "2026-10-15";

  it("任何日期只要有任务就允许进入", () => {
    expect(canOpenCalendarDay("2026-10-14", today, 1)).toBe(true);
    expect(canOpenCalendarDay(today, today, 1)).toBe(true);
    expect(canOpenCalendarDay("2026-10-16", today, 1)).toBe(true);
  });

  it("空格仅在今天之后允许进入", () => {
    expect(canOpenCalendarDay("2026-10-14", today, 0)).toBe(false);
    expect(canOpenCalendarDay(today, today, 0)).toBe(false);
    expect(canOpenCalendarDay("2026-10-16", today, 0)).toBe(true);
  });
});

describe("canDropTaskOnCalendarDay 过去日拖放门禁", () => {
  const today = "2026-10-14";

  it("已完成与普通任务共用边界：过去日禁止，今天/未来日允许", () => {
    expect(canDropTaskOnCalendarDay("2026-10-11", today)).toBe(false);
    expect(canDropTaskOnCalendarDay(today, today)).toBe(true);
    expect(canDropTaskOnCalendarDay("2026-10-20", today)).toBe(true);
  });
});

describe("planDeleteDaysPrune 按日修剪（2026-10-10 用户决策：删一天只移除那一天）", () => {
  it("多天任务删其中一天：只修剪该日，任务保留、其余日期不动", () => {
    const plan = planDeleteDaysPrune(
      [{ id: "span", scheduledDates: OCT5_9, completedAt: null }],
      ["2026-10-07"],
      todayKey(),
    );
    expect(plan.deleteIds).toEqual([]);
    expect(plan.prunes).toEqual([
      { id: "span", scheduledDates: ["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"] },
    ]);
  });

  it("多天任务删多天（含分散选中）：一并修剪", () => {
    const plan = planDeleteDaysPrune(
      [{ id: "span", scheduledDates: OCT5_9, completedAt: null }],
      ["2026-10-05", "2026-10-09"],
      todayKey(),
    );
    expect(plan.prunes).toEqual([
      { id: "span", scheduledDates: ["2026-10-06", "2026-10-07", "2026-10-08"] },
    ]);
  });

  it("执行期全部命中所选日：整条删除（任务不再有存在日）", () => {
    const plan = planDeleteDaysPrune(
      [
        { id: "span", scheduledDates: OCT5_9, completedAt: null },
        { id: "single", scheduledDates: ["2026-10-07"], completedAt: null },
      ],
      OCT5_9,
      todayKey(),
    );
    expect(plan.deleteIds).toEqual(["span", "single"]);
    expect(plan.prunes).toEqual([]);
  });

  it("未命中任何所选日的任务不受影响", () => {
    const plan = planDeleteDaysPrune(
      [{ id: "other", scheduledDates: ["2026-10-20"], completedAt: null }],
      ["2026-10-07"],
      todayKey(),
    );
    expect(plan).toEqual({ deleteIds: [], prunes: [] });
  });

  it("未安排任务按停靠日归属：命中整条删除（缺失兜底今天）", () => {
    const plan = planDeleteDaysPrune(
      [
        { id: "parked", scheduledDates: [], completedAt: null, parkedDate: "2026-10-07" },
        { id: "fallback", scheduledDates: [], completedAt: null, parkedDate: undefined },
      ],
      ["2026-10-07"],
      "2026-10-07",
    );
    expect(plan.deleteIds).toEqual(["parked", "fallback"]);
  });

  it("已完成任务仍按原日期归属并逐日修剪", () => {
    const plan = planDeleteDaysPrune(
      [
        { id: "done", scheduledDates: OCT5_9, completedAt: "2026-10-10T08:00:00" },
        { id: "done2", scheduledDates: ["2026-10-05"], completedAt: "2026-10-12T08:00:00" },
      ],
      ["2026-10-07"],
      todayKey(),
    );
    expect(plan.deleteIds).toEqual([]);
    expect(plan.prunes).toEqual([{ id: "done", scheduledDates: ["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"] }]);
  });

  it("草稿不入删除范围（与列表渲染同口径）", () => {
    const plan = planDeleteDaysPrune(
      [{ id: "draft", scheduledDates: ["2026-10-07"], completedAt: null, draft: true }],
      ["2026-10-07"],
      todayKey(),
    );
    expect(plan).toEqual({ deleteIds: [], prunes: [] });
  });

  it("空选中 = 空规划", () => {
    expect(planDeleteDaysPrune([{ id: "a", scheduledDates: ["2026-10-07"], completedAt: null }], [], todayKey())).toEqual(
      { deleteIds: [], prunes: [] },
    );
  });
});

describe("deleteDaysFromTasks store 集成（按日修剪全链路）", () => {
  it("删 7 号：跨天任务保留其余四天、单日任务整条删除、无关任务不动", () => {
    const span = emptyTask({ id: "span", title: "跨天", scheduledDates: OCT5_9 });
    const single = emptyTask({ id: "single", title: "单日", scheduledDates: ["2026-10-07"] });
    const other = emptyTask({ id: "other", title: "别的天", scheduledDates: ["2026-10-20"] });
    useTaskStore.setState({ tasks: [span, single, other] });

    useTaskStore.getState().deleteDaysFromTasks(["2026-10-07"]);
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.map((t) => t.id).sort()).toEqual(["other", "span"]);
    expect(tasks.find((t) => t.id === "span")!.scheduledDates).toEqual([
      "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09",
    ]);
    // 修剪过的任务落 updatedAt（与手动编辑同口径参与提醒判定）
    expect(tasks.find((t) => t.id === "span")!.updatedAt).toBeTruthy();
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

  it("进入删除模式后选日（Finder 单选语义），退出复位", () => {
    const store = useCalendarStore.getState();
    store.startDeleteMode();
    expect(useCalendarStore.getState().deleteMode).toBe(true);

    store.selectDeleteDay("2026-10-07");
    expect(useCalendarStore.getState().deleteDays).toEqual(["2026-10-07"]);
    // 再点同一天 = 重置为单选（selectDeleteDay 幂等单选）
    store.selectDeleteDay("2026-10-07");
    expect(useCalendarStore.getState().deleteDays).toEqual(["2026-10-07"]);

    store.cancelDeleteMode();
    expect(useCalendarStore.getState().deleteMode).toBe(false);
    expect(useCalendarStore.getState().deleteDays).toEqual([]);
    expect(useCalendarStore.getState().deleteAnchorDay).toBeNull();
  });
});

// 工作台分桶纯逻辑：按「选中日」（默认今天）拆三栏的口径回归
import { describe, expect, it } from "vitest";
import { bucketWorkbenchColumns } from "../src/shared/workbench";
import type { TaskView } from "../src/shared/types";

// 最小任务夹具：分桶只读 status / scheduledDates / completedAt / sortOrder
let seq = 0;
function makeView(
  status: TaskView["status"],
  extra: Partial<Pick<TaskView, "scheduledDates" | "completedAt" | "sortOrder" | "parkedDate">> = {},
): TaskView {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `task-${seq}`,
    note: "",
    priority: "none",
    scheduledDates: [],todos: [],
    tags: [],
    group: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    completedAt: null,
    completedReason: null,
    sortOrder: seq,
    status,
    ...extra,
  };
}

const TODAY = "2026-10-07"; // 周三；所在周周一为 2026-10-05

describe("bucketWorkbenchColumns", () => {
  it("选中今天：今天/逾期/未安排/当天完成 各归其位；完成日早于选中日的已完成任务不进任何栏", () => {
    const views = [
      makeView("today", { scheduledDates: [TODAY]}),
      makeView("overdue", { scheduledDates: ["2026-10-01"]}),
      makeView("unscheduled"),
      makeView("upcoming", { scheduledDates: ["2026-10-10"]}),
      makeView("done", { scheduledDates: [TODAY], completedAt: "2026-10-07T08:00:00.000Z" }),
      makeView("done", { scheduledDates: ["2026-10-05"], completedAt: "2026-10-05T08:00:00.000Z" }),
    ];
    const cols = bucketWorkbenchColumns(views, TODAY, TODAY);
    expect(cols.dayList.map((v) => v.id)).toEqual([views[0].id]);
    expect(cols.overdue.map((v) => v.id)).toEqual([views[1].id]);
    expect(cols.unscheduled.map((v) => v.id)).toEqual([views[2].id]);
    expect(cols.ahead).toBe(1);
    expect(cols.doneOnDay.map((v) => v.id)).toEqual([views[4].id]);
  });

  it("选中过去某天：安排在该天且未完成的任务进进行中栏（此刻为逾期态），其余往日逾期归独立逾期栏且不重复", () => {
    const views = [
      makeView("overdue", { scheduledDates: ["2026-10-03"]}), // 恰好安排在选中日
      makeView("overdue", { scheduledDates: ["2026-09-30"]}), // 更早的逾期，不属于选中日
      makeView("done", { scheduledDates: ["2026-10-03"], completedAt: "2026-10-03T09:00:00.000Z" }),
      makeView("upcoming", { scheduledDates: ["2026-10-10"]}),
    ];
    const cols = bucketWorkbenchColumns(views, "2026-10-03", TODAY);
    expect(cols.dayList.map((v) => v.id)).toEqual([views[0].id]);
    expect(cols.overdue.map((v) => v.id)).toEqual([views[1].id]);
    expect(cols.doneOnDay.map((v) => v.id)).toEqual([views[2].id]);
    expect(cols.ahead).toBe(1);
  });

  it("选中未来某天：已安排任务进进行中，其余计入 ahead", () => {
    const views = [makeView("upcoming", { scheduledDates: ["2026-10-09"]}), makeView("upcoming", { scheduledDates: ["2026-10-12"]})];
    const cols = bucketWorkbenchColumns(views, "2026-10-09", TODAY);
    expect(cols.dayList.map((v) => v.id)).toEqual([views[0].id]);
    expect(cols.unscheduled).toEqual([]);
    expect(cols.ahead).toBe(1);
  });

  it("已安排的跨天任务在覆盖的每个未来日都进进行中", () => {
    const staged = makeView("upcoming", { scheduledDates: ["2026-10-12", "2026-10-13", "2026-10-14"] });
    expect(bucketWorkbenchColumns([staged], "2026-10-12", TODAY).dayList).toEqual([staged]);
    expect(bucketWorkbenchColumns([staged], "2026-10-14", TODAY).dayList).toEqual([staged]);
    expect(bucketWorkbenchColumns([staged], "2026-10-12", TODAY).unscheduled).toEqual([]);
    expect(bucketWorkbenchColumns([staged], "2026-10-12", "2026-10-12").dayList).toEqual([staged]);
    expect(bucketWorkbenchColumns([staged], "2026-10-12", "2026-10-12").unscheduled).toEqual([]);
  });

  it("未安排任务也按 scheduledDates 归日，不因有日期进入进行中", () => {
    const unscheduled = makeView("unscheduled", { scheduledDates: ["2026-10-12"] });
    const cols = bucketWorkbenchColumns([unscheduled], "2026-10-12", TODAY);
    expect(cols.unscheduled).toEqual([unscheduled]);
    expect(cols.dayList).toEqual([]);
  });

  it("跨天任务在起止日期内的任一天都进进行中栏，区间外不进", () => {
    const span = makeView("today", { scheduledDates: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],});
    expect(bucketWorkbenchColumns([span], "2026-10-05", TODAY).dayList).toEqual([span]);
    expect(bucketWorkbenchColumns([span], "2026-10-07", TODAY).dayList).toEqual([span]);
    expect(bucketWorkbenchColumns([span], "2026-10-09", TODAY).dayList).toEqual([span]);
    expect(bucketWorkbenchColumns([span], "2026-10-10", TODAY).dayList).toEqual([]);
  });

  it("未安排任务按「停靠日」归栏：只进 parkedDate 那天的未安排栏，缺失兜底今天", () => {
    // 显式停靠日：停靠 10-12 的任务只在选中 10-12 时可见
    const parked = [makeView("unscheduled", { parkedDate: "2026-10-12" })];
    expect(bucketWorkbenchColumns(parked, "2026-10-12", TODAY).unscheduled).toHaveLength(1);
    expect(bucketWorkbenchColumns(parked, TODAY, TODAY).unscheduled).toHaveLength(0);
    expect(bucketWorkbenchColumns(parked, "2026-10-03", TODAY).unscheduled).toHaveLength(0);

    // 历史数据无 parkedDate：兜底停靠今天（与「今天」选中日同现，其他日不可见）
    const legacy = [makeView("unscheduled")];
    expect(bucketWorkbenchColumns(legacy, TODAY, TODAY).unscheduled).toHaveLength(1);
    expect(bucketWorkbenchColumns(legacy, "2026-10-12", TODAY).unscheduled).toHaveLength(0);
  });

  it("完成日早于选中日的已完成任务不进工作台任何栏（原「本周稍早」折叠组已按需求移除）", () => {
    const views = [
      makeView("done", { completedAt: "2026-10-06T08:00:00.000Z" }), // 本周二（早于选中周三）
      makeView("done", { completedAt: "2026-10-04T08:00:00.000Z" }), // 上周日
    ];
    const cols = bucketWorkbenchColumns(views, TODAY, TODAY);
    expect(cols.doneOnDay).toEqual([]);
    expect(cols.unscheduled).toEqual([]);
    expect(cols.dayList).toEqual([]);
    expect(cols.overdue).toEqual([]);
  });
});

describe("栏内排序（sortOrder + store.reorder 协同）", () => {
  it("各栏按 sortOrder 升序渲染（乱序输入也归位），已完成栏同样参与排序", () => {
    const a = makeView("today", { scheduledDates: [TODAY], sortOrder: 30 });
    const b = makeView("today", { scheduledDates: [TODAY], sortOrder: 10 });
    const c = makeView("done", { scheduledDates: [TODAY], completedAt: `${TODAY}T08:00:00.000Z`, sortOrder: 9 });
    const d = makeView("done", { scheduledDates: [TODAY], completedAt: `${TODAY}T09:00:00.000Z`, sortOrder: 20 });
    const cols = bucketWorkbenchColumns([a, b, c, d], TODAY, TODAY);
    expect(cols.dayList.map((v) => v.id)).toEqual([b.id, a.id]);
    expect(cols.doneOnDay.map((v) => v.id)).toEqual([c.id, d.id]);
  });

  it("reorder 重写栏内 sortOrder 后，重新分桶得到新顺序（栏内拖拽排序的落库闭环）", () => {
    // 状态由 computeAutoStatus 按真实「今天」派生——用 todayKey() 保证任何运行日期下都是进行中态
    const day = todayKey();
    useTaskStore.setState({
      tasks: [
        { ...baseTask("r1"), scheduledDates: [day]},
        { ...baseTask("r2"), scheduledDates: [day]},
        { ...baseTask("r3"), scheduledDates: [day]},
      ],
    });
    useTaskStore.getState().reorder(["r3", "r1", "r2"]); // 拖 r3 到最前
    const cols = bucketWorkbenchColumns(useTaskStore.getState().views(), day, day);
    expect(cols.dayList.map((v) => v.id)).toEqual(["r3", "r1", "r2"]);
    // 重写为栏内索引：首位为 0
    expect(useTaskStore.getState().tasks.find((t) => t.id === "r3")?.sortOrder).toBe(0);
  });
});

import { useTaskStore } from "../src/stores/useTaskStore";
import { todayKey } from "../src/lib/date";
function baseTask(id: string) {
  return {
    id,
    title: `任务 ${id}`,
    note: "",
    priority: "none" as const,
    todos: [],
    tags: [],
    group: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    completedAt: null,
    completedReason: null,
    sortOrder: 1,
    draft: undefined,
    parkedDate: null,
  };
}

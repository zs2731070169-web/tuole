// 执行期 = 日期集合（2026-10-09 模型改造）：覆盖/平移/逐日移动/顺延基准/日历归属
import { describe, expect, it } from "vitest";
import {
  calendarTaskOnDay,
  expandLegacySpan,
  isContiguousDays,
  lastScheduledDay,
  movedDay,
  movedSchedule,
  normalizeScheduledDays,
  rollOverBaseDate,
  scheduleStartForEnd,
  scheduledOnDay,
} from "../src/shared/taskDates";
import { useTaskStore, emptyTask } from "../src/stores/useTaskStore";
import { computeAutoStatus } from "../src/shared/statusMachine";
import { addDaysKey, todayKey } from "../src/lib/date";
import type { Task } from "../src/shared/types";

const OCT5_9 = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];

describe("任务执行期（日期集合）", () => {
  it("成员判定 = includes；跨月集合逐日照常命中", () => {
    expect(scheduledOnDay({ scheduledDates: ["2026-10-08"] }, "2026-10-09")).toBe(false);
    const span = { scheduledDates: ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"] };
    expect(scheduledOnDay(span, "2026-10-30")).toBe(true);
    expect(scheduledOnDay(span, "2026-11-01")).toBe(true);
    expect(scheduledOnDay(span, "2026-11-02")).toBe(true);
    expect(scheduledOnDay(span, "2026-11-03")).toBe(false);
  });

  it("整体平移：全部日期同步位移、首日精确落点；取消安排清空集合", () => {
    const span = { scheduledDates: ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"] };
    expect(movedSchedule(span, "2026-11-05")).toEqual({
      scheduledDates: ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"],
    });
    expect(movedSchedule(span, null)).toEqual({ scheduledDates: [] });
    expect(scheduleStartForEnd(span, "2026-10-07")).toBe("2026-10-04");
  });

  it("分散集合同样整体平移（逐日保持相对关系）", () => {
    const scattered = { scheduledDates: ["2026-10-05", "2026-10-08", "2026-10-16"] };
    expect(movedSchedule(scattered, "2026-10-06")).toEqual({
      scheduledDates: ["2026-10-06", "2026-10-09", "2026-10-17"],
    });
  });

  it("连续性判定：连续/分散/空集合", () => {
    expect(isContiguousDays({ scheduledDates: OCT5_9 })).toBe(true);
    expect(isContiguousDays({ scheduledDates: ["2026-10-05", "2026-10-06", "2026-10-08"] })).toBe(false);
    expect(isContiguousDays({ scheduledDates: [] })).toBe(true);
  });

  it("已完成任务仍在原所属日出现在日历", () => {
    const done = { scheduledDates: OCT5_9, completedAt: "2026-10-07T12:00:00" };
    expect(calendarTaskOnDay(done, "2026-10-05")).toBe(true);
    expect(calendarTaskOnDay(done, "2026-10-07")).toBe(true);
    expect(calendarTaskOnDay(done, "2026-10-10")).toBe(false);
  });

  it("store 行内改期整体平移，旧 null 调用不再清空日期", () => {
    const task = emptyTask({ id: "span", title: "跨天任务", scheduledDates: OCT5_9 });
    useTaskStore.setState({ tasks: [task] });
    useTaskStore.getState().scheduleTo(task.id, "2026-10-08");
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      scheduledDates: ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"],
    });
    useTaskStore.getState().scheduleTo(task.id, null, "2026-10-08");
    expect(useTaskStore.getState().tasks[0].scheduledDates).toEqual([
      "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12",
    ]);
  });

  it("顺延基准 = max(今天, 末个执行日)：未来任务取自身末日，其余取今天", () => {
    const today = "2026-10-09";
    expect(rollOverBaseDate({ scheduledDates: ["2026-10-10"] }, today)).toBe("2026-10-10");
    expect(rollOverBaseDate({ scheduledDates: ["2026-10-10", "2026-10-11", "2026-10-12"] }, today)).toBe("2026-10-12");
    expect(rollOverBaseDate({ scheduledDates: [today] }, today)).toBe(today);
    expect(rollOverBaseDate({ scheduledDates: ["2026-10-05"] }, today)).toBe(today);
    expect(rollOverBaseDate({ scheduledDates: [] }, today)).toBe(today);
  });

  it("store 顺延：未来任务从自身末日 +1，逾期/今天任务推到明天且整体平移", () => {
    const today = todayKey();
    const tomorrow = addDaysKey(today, 1);
    const makeTask = (id: string, dates: string[]): Task =>
      emptyTask({ id, title: id, scheduledDates: dates });
    // 用户实测场景：明天（upcoming）的单日任务点顺延，期望推到后天而非原地不动
    const upcoming = makeTask("upcoming", [tomorrow]);
    const overdue = makeTask("overdue", [addDaysKey(today, -3), addDaysKey(today, -2), addDaysKey(today, -1)]);
    useTaskStore.setState({ tasks: [upcoming, overdue] });
    useTaskStore.getState().rollOver(["upcoming", "overdue"]);
    const [afterUpcoming, afterOverdue] = useTaskStore.getState().tasks;
    expect(afterUpcoming.scheduledDates).toEqual([addDaysKey(tomorrow, 1)]);
    // 逾期任务从今天起推到明天，3 天整体平移保留
    expect(afterOverdue.scheduledDates).toEqual([tomorrow, addDaysKey(tomorrow, 1), addDaysKey(tomorrow, 2)]);
  });
});

describe("movedDay 逐日移动（日历拖拽，2026-10-09 用户定调）", () => {
  it("只动被拖那一天，其余日期零改动（执行期变分散）", () => {
    expect(movedDay({ scheduledDates: OCT5_9 }, "2026-10-07", "2026-10-16")).toEqual([
      "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09", "2026-10-16",
    ]);
  });

  it("移动端点日：集合收缩/偏移，其他日不动", () => {
    // 把末日 9 号挪到 2 号：起点前移，中间日不动
    expect(movedDay({ scheduledDates: OCT5_9 }, "2026-10-09", "2026-10-02")).toEqual([
      "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08",
    ]);
  });

  it("源日不在集合内：无效移动原样返回", () => {
    expect(movedDay({ scheduledDates: OCT5_9 }, "2026-10-20", "2026-10-25")).toEqual(OCT5_9);
  });

  it("结果恒为排序去重集合", () => {
    expect(movedDay({ scheduledDates: ["2026-10-08"] }, "2026-10-08", "2026-10-05")).toEqual(["2026-10-05"]);
  });
});

describe("moveTaskDay store 集成（日历拖拽落点全链路）", () => {
  it("拖 7 号的 chip 到 16 号：仅 7→16，其余日零改动", () => {
    const base = emptyTask({ id: "span-task", title: "跨天任务", scheduledDates: OCT5_9 });
    useTaskStore.setState({ tasks: [base] });
    useTaskStore.getState().moveTaskDay("span-task", "2026-10-07", "2026-10-16");
    const moved = useTaskStore.getState().tasks[0];
    expect(moved.scheduledDates).toEqual(["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09", "2026-10-16"]);
    expect(isContiguousDays(moved)).toBe(false); // 执行期已分散（模型改造的核心目的）
    expect(lastScheduledDay(moved)).toBe("2026-10-16");
  });

  it("未安排任务移到其他日：只改日期，startedAt 仍为 null", () => {
    const base = emptyTask({
      id: "unscheduled-move",
      title: "未安排任务",
      scheduledDates: ["2026-10-08"],
      startedAt: null,
    });
    useTaskStore.setState({ tasks: [base] });
    useTaskStore.getState().moveTaskDay(base.id, "2026-10-08", "2026-10-20");
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      scheduledDates: ["2026-10-20"],
      startedAt: null,
    });
  });

  it("安排/拖回未安排只改生命周期，不改日期", () => {
    const base = emptyTask({
      id: "lifecycle",
      title: "状态切换",
      scheduledDates: ["2026-10-20"],
      startedAt: null,
    });
    useTaskStore.setState({ tasks: [base] });
    useTaskStore.getState().startTask(base.id);
    const started = useTaskStore.getState().tasks[0];
    expect(started.startedAt).toEqual(expect.any(String));
    expect(started.scheduledDates).toEqual(["2026-10-20"]);
    useTaskStore.getState().markUnscheduled(base.id);
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      scheduledDates: ["2026-10-20"],
      startedAt: null,
    });
  });

  it("已完成任务重新打开：清完成记录、保留原安排日期与已开始标记", () => {
    const scheduledDates = ["2026-10-11"];
    const base = emptyTask({
      id: "reopen-done",
      title: "重新打开我",
      scheduledDates,
      startedAt: "2026-10-11T08:00:00.000Z",
      completedAt: "2026-10-12T09:00:00.000Z",
      completedReason: "manual",
    });
    useTaskStore.setState({ tasks: [base] });

    useTaskStore.getState().reopen(base.id);

    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      scheduledDates,
      startedAt: "2026-10-11T08:00:00.000Z",
      completedAt: null,
      completedReason: null,
    });
  });

  it("无效源日 = 真无操作：不得侧写清停靠日（未安排 chip 拖到哪都瞬移进今天格的根因）", () => {
    // 未安排任务的 chip 停靠在 8 号格（scheduledDates 为空，源日=停靠日不在集合内）。
    // 旧实现 movedDay 原样返回集合、但副作用照落：parkedDate 被清成 null 后
    // byDay 的「parkedDate ?? 今天」兜底会把 chip 重新渲染进今天格——无论拖到哪
    const parked = emptyTask({ id: "parked", title: "未安排任务", scheduledDates: [], parkedDate: "2026-10-08" });
    useTaskStore.setState({ tasks: [parked] });
    const before = useTaskStore.getState().tasks[0];
    useTaskStore.getState().moveTaskDay("parked", "2026-10-08", "2026-10-20");
    // 引用不变 = 未 set：停靠日、updatedAt 等一概原样（真无操作，非「改回原值」）
    expect(useTaskStore.getState().tasks[0]).toBe(before);
  });

  it("无效源日也不清完成态：完成日不在执行期内的已完成任务拖放 = 原样保留", () => {
    const done = emptyTask({
      id: "done-late",
      title: "逾期后完成",
      scheduledDates: ["2026-10-05"],
      completedAt: "2026-10-09T08:00:00.000Z",
      completedReason: "manual",
    });
    useTaskStore.setState({ tasks: [done] });
    const before = useTaskStore.getState().tasks[0];
    // 拖它今天格（完成日 9 号）的 chip：9 号不在执行期内，旧实现会静默重开该任务
    useTaskStore.getState().moveTaskDay("done-late", "2026-10-09", "2026-10-20");
    expect(useTaskStore.getState().tasks[0]).toBe(before);
  });

  it("今天格 chip 回挪到有任务的过去格（2026-10-17）：只动那一天，startedAt 保留、状态派生逾期", () => {
    const todayTask = emptyTask({
      id: "today-to-past",
      title: "其实发生在往日",
      scheduledDates: ["2026-10-14"],
      startedAt: "2026-10-14T08:00:00.000Z",
    });
    useTaskStore.setState({ tasks: [todayTask] });

    useTaskStore.getState().moveTaskDay("today-to-past", "2026-10-14", "2026-10-12");

    const moved = useTaskStore.getState().tasks[0];
    expect(moved.scheduledDates).toEqual(["2026-10-12"]);
    // 日期与生命周期解耦：回挪只改日期，已开始标记原样保留
    expect(moved.startedAt).toBe("2026-10-14T08:00:00.000Z");
    // 首日 < 今天 → 欠账（与工作台「拖入逾期」同语义），绝不自动完成
    expect(computeAutoStatus(moved, { now: new Date("2026-10-14T12:00:00") })).toBe("overdue");
  });

  it("已完成任务移到其他日历格：只移源日，完成态与完成时间保持", () => {
    const done = emptyTask({
      id: "done-move-day",
      title: "调整归属日",
      scheduledDates: ["2026-10-10", "2026-10-11"],
      startedAt: "2026-10-10T08:00:00.000Z",
      completedAt: "2026-10-12T09:00:00.000Z",
      completedReason: "manual",
    });
    useTaskStore.setState({ tasks: [done] });

    useTaskStore.getState().moveTaskDay(done.id, "2026-10-11", "2026-10-13");

    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      scheduledDates: ["2026-10-10", "2026-10-13"],
      completedAt: "2026-10-12T09:00:00.000Z",
      completedReason: "manual",
    });
  });
});

describe("存储归一与旧区间展开（迁移）", () => {
  it("normalizeScheduledDays：非数组 → []；非法键剔除；去重排序", () => {
    expect(normalizeScheduledDays(undefined)).toEqual([]);
    expect(normalizeScheduledDays("2026-10-05")).toEqual([]);
    expect(normalizeScheduledDays(["2026-10-08", "bad", "2026-10-05", "2026-10-08"])).toEqual(["2026-10-05", "2026-10-08"]);
  });

  it("expandLegacySpan：旧起止区间展开为全量日期（含两端）；非法键空数组", () => {
    expect(expandLegacySpan("2026-10-05", "2026-10-07")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(expandLegacySpan("2026-10-05", null)).toEqual(["2026-10-05"]);
    expect(expandLegacySpan("2026-10-05", "2026-10-01")).toEqual(["2026-10-05"]); // 逆序兜底为单日
    expect(expandLegacySpan("not-a-date", null)).toEqual([]);
  });

  it("loadTasks 旧 scheduledDate/dueDate 键迁移为集合并剥离旧键", async () => {
    const { loadTasks } = await import("../src/lib/storage");
    const raw = JSON.stringify([
      { ...emptyTask({ id: "legacy" }), scheduledDates: undefined, scheduledDate: "2026-10-05", dueDate: "2026-10-07" },
      { ...emptyTask({ id: "single" }), scheduledDates: undefined, scheduledDate: "2026-10-09", dueDate: null },
    ]);
    // 直接走 loadTasks 需要 localStorage 桩；此处经由 importTasks（同迁移单点）验证
    useTaskStore.setState({ tasks: [] });
    useTaskStore.getState().importTasks(JSON.parse(raw), "replace");
    const tasks = useTaskStore.getState().tasks;
    expect(tasks[0].scheduledDates).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(tasks[0]).not.toHaveProperty("scheduledDate");
    expect(tasks[1].scheduledDates).toEqual(["2026-10-09"]);
    expect(tasks[1]).not.toHaveProperty("dueDate");
  });
});

// 筛选组合逻辑测试：状态 + 优先级 + 日期范围 + 关键词
import { describe, it, expect } from "vitest";
import { applyFilters, hasActiveFilter, EMPTY_FILTER, sortTasks } from "../src/shared/filter";
import type { TaskView, FilterState } from "../src/shared/types";

function tv(over: Partial<TaskView>): TaskView {
  return {
    id: Math.random().toString(),
    title: "",
    note: "",
    priority: "none",
    scheduledDates: [],todos: [],
    tags: [],
    group: null,
    createdAt: "2026-10-01T00:00:00Z",
    completedAt: null,
    completedReason: null,
    sortOrder: 0,
    status: "today",
    ...over,
  } as TaskView;
}

const list: TaskView[] = [
  tv({ title: "写周报", priority: "high", scheduledDates: ["2026-10-07"], status: "today" }),
  tv({ title: "买菜", priority: "low", scheduledDates: ["2026-10-05"], status: "overdue" }),
  tv({ title: "体检", priority: "medium", scheduledDates: ["2026-10-20"], status: "upcoming" }),
  tv({ title: "读论文", priority: "none", scheduledDates: [], status: "unscheduled" }),
  tv({ title: "交水电费", priority: "medium", scheduledDates: ["2026-10-01"], status: "done", completedAt: "2026-10-02T00:00:00Z" }),
];

describe("applyFilters 单维度", () => {
  it("status=all 返回全部", () => {
    expect(applyFilters(list, { ...EMPTY_FILTER, status: "all" }).length).toBe(5);
  });
  it("status=active 只含 today/upcoming（未安排已独立成维，不并入进行中）", () => {
    const r = applyFilters(list, { ...EMPTY_FILTER, status: "active" });
    expect(r.map((t) => t.status).sort()).toEqual(["today", "upcoming"]);
  });
  it("status=unscheduled 只命中未安排任务", () => {
    const r = applyFilters(list, { ...EMPTY_FILTER, status: "unscheduled" });
    expect(r.map((t) => t.status)).toEqual(["unscheduled"]);
    expect(r[0].title).toBe("读论文");
  });
  it("status=overdue 命中逾期", () => {
    expect(applyFilters(list, { ...EMPTY_FILTER, status: "overdue" })[0].title).toBe("买菜");
  });
  it("priority 多选", () => {
    const r = applyFilters(list, { ...EMPTY_FILTER, priorities: ["high", "medium"] });
    expect(r.length).toBe(3); // 写周报 / 体检 / 交水电费
  });
  it("keyword 模糊匹配标题与备注", () => {
    expect(applyFilters(list, { ...EMPTY_FILTER, keyword: "周" }).length).toBe(1);
  });
});

describe("applyFilters 组合维度", () => {
  it("状态+优先级叠加", () => {
    const f: FilterState = { ...EMPTY_FILTER, status: "active", priorities: ["medium"] };
    const r = applyFilters(list, f);
    expect(r.length).toBe(1);
    expect(r[0].title).toBe("体检");
  });
  it("日期范围过滤安排日期", () => {
    const f: FilterState = { ...EMPTY_FILTER, dateFrom: "2026-10-06", dateTo: "2026-10-10" };
    const r = applyFilters(list, f);
    expect(r.map((t) => t.title)).toEqual(["写周报"]);
  });
  it("日期范围与任务执行期有交集时展示跨天任务", () => {
    const span = tv({ title: "跨天任务", scheduledDates: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],});
    expect(applyFilters([span], { ...EMPTY_FILTER, dateFrom: "2026-10-07", dateTo: "2026-10-07" })).toEqual([span]);
    expect(applyFilters([span], { ...EMPTY_FILTER, dateFrom: "2026-10-10", dateTo: "2026-10-10" })).toEqual([]);
  });
  it("设了日期范围时未安排任务被排除", () => {
    const f: FilterState = { ...EMPTY_FILTER, dateFrom: "2026-10-01", dateTo: "2026-12-31" };
    expect(applyFilters(list, f).some((t) => t.scheduledDates.length === 0)).toBe(false);
  });
  it("完成时间不改任务日期归属", () => {
    const f: FilterState = { ...EMPTY_FILTER, dateFrom: "2026-10-02", dateTo: "2026-10-02" };
    expect(applyFilters(list, f).map((t) => t.title)).toEqual([]);
  });
  it("日期范围仍命中安排日：日历视角能看到当天已完成的任务", () => {
    const f: FilterState = { ...EMPTY_FILTER, dateFrom: "2026-10-01", dateTo: "2026-10-01" };
    expect(applyFilters(list, f).map((t) => t.title)).toEqual(["交水电费"]);
  });
  it("历史无日期的已完成任务不用完成日代替任务日期", () => {
    const done = tv({ title: "直接完成", scheduledDates: [], status: "done", completedAt: "2026-10-07T08:00:00Z" });
    const f: FilterState = { ...EMPTY_FILTER, dateFrom: "2026-10-07", dateTo: "2026-10-07" };
    expect(applyFilters([done], f).length).toBe(0);
  });
});

describe("hasActiveFilter 与排序", () => {
  it("默认筛选不算 active", () => {
    expect(hasActiveFilter(EMPTY_FILTER)).toBe(false);
  });
  it("仅关键词也算 active", () => {
    expect(hasActiveFilter({ ...EMPTY_FILTER, keyword: "x" })).toBe(true);
  });
  it("按优先级排序 high->none", () => {
    const r = sortTasks(list, "priority");
    expect(r[0].priority).toBe("high");
    expect(r[r.length - 1].priority).toBe("none");
  });
  it("按安排日期排序，未安排沉底", () => {
    const r = sortTasks(list, "scheduledDate");
    expect(r[r.length - 1].scheduledDates).toEqual([]);
  });
});

// 优先级筛选「全部」语义：priorities 空 = 不过滤（UI 上「全部」点亮）；任何时刻至少一个选项点亮
import { useFilterStore } from "../src/stores/useFilterStore";

describe("优先级筛选「全部」语义", () => {
  it("默认不过滤（空数组 = 「全部」选中）", () => {
    useFilterStore.getState().clearAll();
    expect(useFilterStore.getState().filter.priorities).toEqual([]);
  });

  it("选具体优先级累积多选；取消到最后一个时归空 = 回落「全部」", () => {
    useFilterStore.getState().clearAll();
    useFilterStore.getState().togglePriority("high");
    useFilterStore.getState().togglePriority("medium");
    expect(useFilterStore.getState().filter.priorities).toEqual(["high", "medium"]);
    useFilterStore.getState().togglePriority("high");
    expect(useFilterStore.getState().filter.priorities).toEqual(["medium"]);
    useFilterStore.getState().togglePriority("medium");
    expect(useFilterStore.getState().filter.priorities).toEqual([]);
  });

  it("clearPriorities 清空具体选择（点「全部」）；togglePriority 的 none 入参是受保护的空操作", () => {
    useFilterStore.getState().clearAll();
    useFilterStore.getState().togglePriority("high");
    useFilterStore.getState().clearPriorities();
    expect(useFilterStore.getState().filter.priorities).toEqual([]);
    useFilterStore.getState().togglePriority("none");
    expect(useFilterStore.getState().filter.priorities).toEqual([]);
    useFilterStore.getState().clearAll();
  });
});

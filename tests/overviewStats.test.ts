// 概览统计纯逻辑：既有六格/节奏图口径回归 + 洞察面板新口径（按期率/账龄/积压/负载/环比/剪刀差/优先级）
import { describe, expect, it } from "vitest";
import { computeOverviewStats } from "../src/shared/overviewStats";
import type { Priority, TaskView } from "../src/shared/types";

// 最小任务夹具：概览统计只读 日期族字段 + priority + completedAt
let seq = 0;
function makeView(
  extra: Partial<
    Pick<
      TaskView,
      "status" | "scheduledDates" | "completedAt" | "parkedDate" | "priority" | "createdAt"
    >
  > = {},
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
    createdAt: "2026-10-01T08:00:00.000Z", // 默认落在近30天窗口内、停靠仅 7 天（不构成积压）
    completedAt: null,
    completedReason: null,
    sortOrder: seq,
    status: "unscheduled",
    ...extra,
  };
}

// 固定「现在」：2026-10-08 周四 —— 本周 10-05..10-11，上周 09-28..10-04，近30天窗口 09-09..10-08
const NOW = new Date("2026-10-08T12:00:00");
const TODAY = "2026-10-08";

describe("computeOverviewStats · 既有口径回归", () => {
  it("六格计数：全部/逾期/进行中/未安排 与周月完成窗口", () => {
    const views = [
      makeView({ status: "today", scheduledDates: [TODAY]}),
      makeView({ status: "upcoming", scheduledDates: ["2026-10-10"]}),
      makeView({ status: "overdue", scheduledDates: ["2026-10-04"]}),
      makeView({ status: "unscheduled" }),
      makeView({ status: "done", scheduledDates: ["2026-10-06"], completedAt: "2026-10-06T08:00:00.000Z" }), // 本周 + 近30天
      makeView({ status: "done", scheduledDates: ["2026-09-05"], completedAt: "2026-09-05T08:00:00.000Z" }), // 近30天窗口（09-09 起）之外
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.total).toBe(6);
    expect(stats.totalDone).toBe(2);
    expect(stats.overdue).toBe(1);
    expect(stats.unscheduled).toBe(1);
    expect(stats.active).toBe(2);
    expect(stats.weekCompleted).toBe(1);
    expect(stats.monthCompleted).toBe(1);
  });

  it("近30天节奏槽位正序：今天落在最右（i=29），29 天前落在最左（i=0）——镜像错配回归", () => {
    const views = [
      makeView({ status: "done", completedAt: "2026-10-08T08:00:00.000Z" }),
      makeView({ status: "done", completedAt: "2026-09-09T08:00:00.000Z" }),
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.daily[29]).toBe(1); // 今天
    expect(stats.daily[0]).toBe(1); // 09-09 = 恰 29 天前
    expect(stats.daily.filter((n) => n > 0)).toHaveLength(2);
    expect(stats.peak).toBe(1);
    expect(stats.dailyKeys[29]).toBe(TODAY);
    expect(stats.dailyKeys[0]).toBe("2026-09-09");
  });
});

describe("computeOverviewStats · 按期完成率", () => {
  it("完成日 = 执行期结束日（dueDate 基准）判按期", () => {
    const views = [
      makeView({ status: "done", scheduledDates: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"],completedAt: "2026-10-05T08:00:00.000Z" }),
      makeView({ status: "done", scheduledDates: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"],completedAt: "2026-10-06T08:00:00.000Z" }),
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.onTimeCount).toBe(1);
    expect(stats.onTimeJudged).toBe(2);
    expect(stats.onTimeRate).toBe(50);
  });

  it("单日任务：完成日 = 安排日按期，晚于安排日拖欠", () => {
    const views = [
      makeView({ status: "done", scheduledDates: ["2026-10-01"], completedAt: "2026-10-01T08:00:00.000Z" }),
      makeView({ status: "done", scheduledDates: ["2026-10-01"], completedAt: "2026-10-03T08:00:00.000Z" }),
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.onTimeCount).toBe(1);
    expect(stats.onTimeRate).toBe(50);
  });

  it("无执行期基准的已完成任务不入分母；无可判定任务时 rate 为 null", () => {
    const views = [makeView({ status: "done", completedAt: "2026-10-02T08:00:00.000Z" })];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.onTimeJudged).toBe(0);
    expect(stats.onTimeRate).toBeNull();

    const empty = computeOverviewStats([], NOW);
    expect(empty.onTimeRate).toBeNull();
  });
});

describe("computeOverviewStats · 逾期账龄分布", () => {
  it("桶边界：结束 1/3 天前归首桶，4/7 天前归中桶，8 天前起归末桶", () => {
    const views = [
      makeView({ status: "overdue", scheduledDates: ["2026-10-07"]}), // 1 天
      makeView({ status: "overdue", scheduledDates: ["2026-10-05"]}), // 3 天
      makeView({ status: "overdue", scheduledDates: ["2026-10-04"]}), // 4 天
      makeView({ status: "overdue", scheduledDates: ["2026-10-01"]}), // 7 天
      makeView({ status: "overdue", scheduledDates: ["2026-09-30"]}), // 8 天
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.overdueAgeBuckets).toEqual([2, 2, 1]);
    expect(stats.overdueMaxAgeDays).toBe(8);
  });

  it("账龄按执行期结束日（dueDate）计，而非起始日", () => {
    const views = [makeView({ status: "overdue", scheduledDates: ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"],})]; // 结束 3 天前
    const stats = computeOverviewStats(views, NOW);
    expect(stats.overdueAgeBuckets).toEqual([1, 0, 0]);
    expect(stats.overdueMaxAgeDays).toBe(3);
  });

  it("无逾期：三桶全零、最长账龄 null", () => {
    const stats = computeOverviewStats([makeView({ status: "today", scheduledDates: [TODAY]})], NOW);
    expect(stats.overdueAgeBuckets).toEqual([0, 0, 0]);
    expect(stats.overdueMaxAgeDays).toBeNull();
  });
});

describe("computeOverviewStats · 未安排积压年龄", () => {
  it("停靠 7 天不计、第 8 天起计积压；无 parkedDate 兜底 createdAt", () => {
    const views = [
      makeView({ status: "unscheduled", parkedDate: "2026-10-01" }), // 7 天，不积压
      makeView({ status: "unscheduled", parkedDate: "2026-09-30" }), // 8 天，积压
      makeView({ status: "unscheduled", createdAt: "2026-09-20T08:00:00.000Z" }), // 兜底 createdAt → 18 天，积压
      makeView({ status: "unscheduled", parkedDate: TODAY }),
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.staleUnscheduledCount).toBe(2);
    expect(stats.unscheduled).toBe(4);
  });
});

describe("computeOverviewStats · 未来 7 天负载", () => {
  it("今天起含今天共 7 天，跨日执行期逐日记数、今天描环位为首位", () => {
    const views = [
      makeView({ status: "today", scheduledDates: ["2026-10-08", "2026-10-09", "2026-10-10"],}),
      makeView({ status: "upcoming", scheduledDates: ["2026-10-14"]}), // 第 7 天（index 6）
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.upcomingLoadDays.map((d) => d.key)).toEqual([
      "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11",
      "2026-10-12", "2026-10-13", "2026-10-14",
    ]);
    expect(stats.upcomingLoadDays.map((d) => d.count)).toEqual([1, 1, 1, 0, 0, 0, 1]);
  });

  it("已完成与未安排任务不计入负载", () => {
    const views = [
      makeView({ status: "done", scheduledDates: [TODAY], completedAt: "2026-10-08T08:00:00.000Z" }),
      makeView({ status: "unscheduled" }),
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.upcomingLoadDays.every((d) => d.count === 0)).toBe(true);
  });
});

describe("computeOverviewStats · 本周环比", () => {
  it("上周完成 0 项时环比为 null（不给 ±∞）", () => {
    const views = [
      makeView({ status: "done", completedAt: "2026-10-06T08:00:00.000Z" }), // 本周一
      makeView({ status: "done", completedAt: "2026-10-08T08:00:00.000Z" }),
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.weekCompleted).toBe(2);
    expect(stats.lastWeekCompleted).toBe(0);
    expect(stats.weekDeltaPercent).toBeNull();
  });

  it("常规环比四舍五入取整；差为 0 给 0", () => {
    const down = computeOverviewStats(
      [
        makeView({ status: "done", completedAt: "2026-10-06T08:00:00.000Z" }), // 本周 3
        makeView({ status: "done", completedAt: "2026-10-07T08:00:00.000Z" }),
        makeView({ status: "done", completedAt: "2026-10-08T08:00:00.000Z" }),
        makeView({ status: "done", completedAt: "2026-09-28T08:00:00.000Z" }), // 上周 4
        makeView({ status: "done", completedAt: "2026-09-29T08:00:00.000Z" }),
        makeView({ status: "done", completedAt: "2026-09-30T08:00:00.000Z" }),
        makeView({ status: "done", completedAt: "2026-10-04T08:00:00.000Z" }),
      ],
      NOW,
    );
    expect(down.lastWeekCompleted).toBe(4);
    expect(down.weekDeltaPercent).toBe(-25);

    const flat = computeOverviewStats(
      [
        makeView({ status: "done", completedAt: "2026-10-05T08:00:00.000Z" }),
        makeView({ status: "done", completedAt: "2026-09-29T08:00:00.000Z" }),
      ],
      NOW,
    );
    expect(flat.weekDeltaPercent).toBe(0);
  });
});

describe("computeOverviewStats · 近30天新建 vs 完成", () => {
  it("窗口内创建计数（含已完成），净差 = 新建 − 完成；窗口边界为 29 天前（含）", () => {
    const views = [
      makeView({ status: "today", scheduledDates: [TODAY], createdAt: "2026-10-08T08:00:00.000Z" }),
      makeView({ status: "unscheduled", createdAt: "2026-09-15T08:00:00.000Z" }),
      makeView({ status: "done", completedAt: "2026-10-07T08:00:00.000Z", createdAt: "2026-09-09T08:00:00.000Z" }), // 边界：恰 29 天前
      makeView({ status: "unscheduled", createdAt: "2026-09-08T08:00:00.000Z" }), // 窗口外
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.createdIn30).toBe(3);
    expect(stats.monthCompleted).toBe(1);
    expect(stats.netFlow30).toBe(2);
  });
});

describe("computeOverviewStats · 未结优先级分布", () => {
  it("只统计未完成任务；四档计数齐备", () => {
    const views = [
      makeView({ status: "today", scheduledDates: [TODAY], priority: "high" }),
      makeView({ status: "unscheduled", priority: "high" }),
      makeView({ status: "done", priority: "high", completedAt: "2026-10-07T08:00:00.000Z" }), // 已完成不参与
      makeView({ status: "upcoming", scheduledDates: ["2026-10-10"], priority: "medium" }),
      makeView({ status: "overdue", scheduledDates: ["2026-10-04"], priority: "medium" }),
      makeView({ status: "unscheduled" }), // none
      makeView({ status: "today", scheduledDates: [TODAY]}), // none
    ];
    const stats = computeOverviewStats(views, NOW);
    expect(stats.priorityMix).toEqual<Record<Priority, number>>({
      high: 2,
      medium: 2,
      low: 0,
      none: 2,
    });
  });
});

// 概览统计纯逻辑：StatsCard 五格口径回归 + 时间投入日积分（洞察六指标已于 2026-10-10 随用户决策下线）
import { describe, expect, it } from "vitest";
import { computeMonthInvestment, computeOverviewStats } from "../src/shared/overviewStats";
import type { TaskView } from "../src/shared/types";

// 最小任务夹具：概览统计只读 日期族字段 + startedAt + completedAt
let seq = 0;
function makeView(
  extra: Partial<
    Pick<
      TaskView,
      "status" | "scheduledDates" | "completedAt" | "parkedDate" | "startedAt" | "createdAt"
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
    createdAt: "2026-10-01T08:00:00.000Z",
    completedAt: null,
    completedReason: null,
    sortOrder: seq,
    status: "unscheduled",
    ...extra,
  };
}

// 固定「现在」：2026-10-08 周四 12:00（本地时区）—— 近30天窗口 09-09..10-08
const NOW = new Date("2026-10-08T12:00:00");
const TODAY = "2026-10-08";

describe("computeOverviewStats · 五格指标回归", () => {
  it("全部/逾期/进行中/未安排与总体完成数", () => {
    const views = [
      makeView({ status: "today", scheduledDates: [TODAY]}),
      makeView({ status: "upcoming", scheduledDates: ["2026-10-10"]}),
      makeView({ status: "overdue", scheduledDates: ["2026-10-04"]}),
      makeView({ status: "unscheduled" }),
      makeView({ status: "done", scheduledDates: ["2026-10-06"], completedAt: "2026-10-06T08:00:00.000Z" }),
      makeView({ status: "done", scheduledDates: ["2026-09-05"], completedAt: "2026-09-05T08:00:00.000Z" }),
    ];
    const stats = computeOverviewStats(views);
    expect(stats.total).toBe(6);
    expect(stats.totalDone).toBe(2);
    expect(stats.overdue).toBe(1);
    expect(stats.unscheduled).toBe(1);
    expect(stats.active).toBe(2);
  });
});

describe("computeMonthInvestment · 自然月投入网格（月底复盘口径）", () => {
  it("缺省 = 当前月：1 日 → 月末键序、今日槽位正确、未来日零贡献", () => {
    const stats = computeMonthInvestment(
      [makeView({ status: "today", scheduledDates: [TODAY], startedAt: "2026-10-08T09:00:00" })],
      NOW,
    );
    expect(stats.monthKey).toBe("2026-10");
    expect(stats.dailyKeys).toHaveLength(31); // 10 月 31 天
    expect(stats.dailyKeys[0]).toBe("2026-10-01");
    expect(stats.dailyKeys[7]).toBe(TODAY); // 槽位镜像：8 日 = i=7
    expect(stats.dailyMinutes[7]).toBe(3 * 60);
    expect(stats.dailyMinutes.slice(8).every((m) => m === 0)).toBe(true); // 未来日零贡献
    expect(stats.totalMinutes).toBe(3 * 60);
    expect(stats.avgMinutes).toBe(Math.round((3 * 60) / 8)); // 当前月日均分母 = 已过天数（含今天）
    expect(stats.todayMinutes).toBe(3 * 60);
  });

  it("跨天完成窗口按日切分（月初段）", () => {
    const stats = computeMonthInvestment(
      [makeView({ status: "done", scheduledDates: ["2026-10-06", "2026-10-07"], startedAt: "2026-10-06T09:00:00", completedAt: "2026-10-07T15:00:00" })],
      NOW,
    );
    expect(stats.dailyMinutes[5]).toBe(15 * 60); // 10-06
    expect(stats.dailyMinutes[6]).toBe(15 * 60); // 10-07
    expect(stats.totalMinutes).toBe(30 * 60);
  });

  it("历史月：月长网格、日均分母 = 当月天数、今日无意义（0）", () => {
    const views = [
      makeView({ status: "done", scheduledDates: ["2026-09-28", "2026-09-29", "2026-09-30"], startedAt: "2026-09-28T09:00:00", completedAt: "2026-09-30T15:00:00" }),
    ];
    const stats = computeMonthInvestment(views, NOW, "2026-09");
    expect(stats.monthKey).toBe("2026-09");
    expect(stats.dailyKeys).toHaveLength(30);
    expect(stats.dailyMinutes[27]).toBe(15 * 60); // 09-28
    expect(stats.dailyMinutes[28]).toBe(24 * 60); // 09-29
    expect(stats.dailyMinutes[29]).toBe(15 * 60); // 09-30：00:00 → 15:00
    expect(stats.totalMinutes).toBe(54 * 60);
    expect(stats.avgMinutes).toBe(Math.round((54 * 60) / 30));
    expect(stats.todayMinutes).toBe(0);
  });

  it("跨月窗口分别落入两个月", () => {
    const views = [
      makeView({ status: "done", scheduledDates: ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"], startedAt: "2026-09-29T00:00:00", completedAt: "2026-10-02T12:00:00" }),
    ];
    const october = computeMonthInvestment(views, NOW, "2026-10");
    expect(october.dailyMinutes[0]).toBe(24 * 60); // 10-01
    expect(october.dailyMinutes[1]).toBe(12 * 60); // 10-02
    expect(october.totalMinutes).toBe(36 * 60);
    const september = computeMonthInvestment(views, NOW, "2026-09");
    expect(september.dailyMinutes[28]).toBe(24 * 60); // 09-29
    expect(september.dailyMinutes[29]).toBe(24 * 60); // 09-30
    expect(september.totalMinutes).toBe(48 * 60);
  });

  it("未来月与非法月键回退当前月；空任务集全零", () => {
    const views = [makeView({ status: "today", scheduledDates: [TODAY], startedAt: "2026-10-08T09:00:00" })];
    expect(computeMonthInvestment(views, NOW, "2026-11").monthKey).toBe("2026-10");
    expect(computeMonthInvestment(views, NOW, "9999-01").monthKey).toBe("2026-10");
    const empty = computeMonthInvestment([], NOW);
    expect(empty.dailyMinutes.every((m) => m === 0)).toBe(true);
    expect(empty.avgMinutes).toBe(0);
  });
});

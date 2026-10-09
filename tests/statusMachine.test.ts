// 状态机全流转路径测试：含跨天结算与逾期保留
import { describe, it, expect } from "vitest";
import { computeAutoStatus, isActive, canFinish } from "../src/shared/statusMachine";
import type { Task } from "../src/shared/types";

const NOW = new Date("2026-10-07T10:00:00");
const ctx = { now: NOW };

function base(over: Partial<Task>): Pick<Task, "scheduledDates" | "completedAt"> {
  return { scheduledDates: [],completedAt: null, ...over };
}

describe("computeAutoStatus 基础分区", () => {
  it("显式未开始：即使有日期仍是 unscheduled", () => {
    expect(computeAutoStatus(base({ scheduledDates: ["2026-10-07"], startedAt: null }), ctx)).toBe("unscheduled");
  });
  it("无安排日期 -> unscheduled", () => {
    expect(computeAutoStatus(base({}), ctx)).toBe("unscheduled");
  });
  it("安排今天 -> today", () => {
    expect(computeAutoStatus(base({ scheduledDates: ["2026-10-07"]}), ctx)).toBe("today");
  });
  it("安排未来 -> upcoming", () => {
    expect(computeAutoStatus(base({ scheduledDates: ["2026-10-20"]}), ctx)).toBe("upcoming");
  });
  it("安排过去 -> overdue（绝不自动完成）", () => {
    expect(computeAutoStatus(base({ scheduledDates: ["2026-10-01"]}), ctx)).toBe("overdue");
  });
  it("跨天任务在执行期内保持 today，结束日次日才逾期", () => {
    const span = base({ scheduledDates: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],});
    expect(computeAutoStatus(span, { now: new Date("2026-10-04T10:00:00") })).toBe("upcoming");
    expect(computeAutoStatus(span, ctx)).toBe("today");
    expect(computeAutoStatus(span, { now: new Date("2026-10-09T10:00:00") })).toBe("today");
    expect(computeAutoStatus(span, { now: new Date("2026-10-10T10:00:00") })).toBe("overdue");
  });
});

describe("done 生命周期", () => {
  it("已完成 -> done", () => {
    const t = base({ completedAt: "2026-10-05T08:00:00Z" });
    expect(computeAutoStatus(t, ctx)).toBe("done");
  });
});

describe("跨天结算（次日 00:00 未处理滚入逾期）", () => {
  it("昨天安排的任务在新的一天变为 overdue", () => {
    const yesterdayTask = base({ scheduledDates: ["2026-10-06"]});
    // 在 10-07 结算
    expect(computeAutoStatus(yesterdayTask, ctx)).toBe("overdue");
  });
});

describe("active 聚合", () => {
  it("upcoming/today 属于进行中，unscheduled/overdue/done 不属于（未安排独立成维）", () => {
    expect(isActive("unscheduled")).toBe(false);
    expect(isActive("upcoming")).toBe(true);
    expect(isActive("today")).toBe(true);
    expect(isActive("overdue")).toBe(false);
    expect(isActive("done")).toBe(false);
  });
});

describe("canFinish 结束门禁（必须排期且日期已到才能结束）", () => {
  it("今天/逾期可结束", () => {
    expect(canFinish("today")).toBe(true);
    expect(canFinish("overdue")).toBe(true);
  });
  it("未安排(unscheduled)不可结束——必须先排期", () => {
    expect(canFinish("unscheduled")).toBe(false);
  });
  it("未来安排(upcoming)不可结束——需等日期到达或改期到今天/更早", () => {
    expect(canFinish("upcoming")).toBe(false);
  });
  it("done 已结束，无「结束」语义", () => {
    expect(canFinish("done")).toBe(false);
  });
});

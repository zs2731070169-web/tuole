// 任务开销窗口契约（2026-10-10 用户定调：只在「进行中」计时）：
// 窗口 = [max(startedAt ?? createdAt, 执行首日 00:00), min(completedAt ?? now, 执行末日 24:00)]——
// 未安排/未来安排不计时、已完成停在完成时刻、逾期超出末日截断（改期推后末日即自动恢复）。
// 时间均为本地时区（与日键口径一致）；单位阶梯与文案组装沿用既有约定。
import { describe, expect, it } from "vitest";
import { computeTaskElapsed, formatMinutesCompound, taskSpendWindow } from "../src/shared/taskElapsed";
import type { TaskStatus } from "../src/shared/types";

const MIN = 60_000;
const HOUR = 60 * MIN;

type Fixture = {
  startedAt?: string | null;
  createdAt: string;
  completedAt: string | null;
  status: TaskStatus;
  scheduledDates: string[];
};

const makeTask = (fixture: Fixture) => ({
  startedAt: "startedAt" in fixture ? fixture.startedAt : undefined,
  createdAt: fixture.createdAt,
  completedAt: fixture.completedAt,
  status: fixture.status,
  scheduledDates: fixture.scheduledDates,
});

describe("taskSpendWindow 窗口边界", () => {
  it("当天安排当天执行：起点 = startedAt 时刻（首日 0 点早于它）", () => {
    const task = makeTask({
      startedAt: "2026-10-08T09:00:00",
      createdAt: "2026-10-08T08:30:00",
      completedAt: null,
      status: "today",
      scheduledDates: ["2026-10-08"],
    });
    const window = taskSpendWindow(task, "2026-10-08T12:00:00")!;
    expect(new Date(window.startEpoch).getHours()).toBe(9);
    expect(new Date(window.endEpoch).getHours()).toBe(12); // 进行中：截到 now
  });

  it("提前安排（startedAt 早于首日）：起点钳到执行首日 00:00——未到执行期不计时", () => {
    const task = makeTask({
      startedAt: "2026-10-06T10:00:00",
      createdAt: "2026-10-06T10:00:00",
      completedAt: null,
      status: "upcoming",
      scheduledDates: ["2026-10-08", "2026-10-09"],
    });
    // upcoming 状态门拦截：窗口未开始 → null
    expect(taskSpendWindow(task, "2026-10-07T12:00:00")).toBeNull();
    // 到达首日后（状态将派生为 today）：起点 = 首日 00:00
    const started = { ...task, status: "today" as TaskStatus };
    const window = taskSpendWindow(started, "2026-10-08T12:00:00")!;
    expect(new Date(window.startEpoch).getDate()).toBe(8);
    expect(new Date(window.startEpoch).getHours()).toBe(0);
  });

  it("逾期截断：末日 24:00 之后不再计时（窗口冻结，改期推后末日自动恢复）", () => {
    const task = makeTask({
      startedAt: "2026-10-05T09:00:00",
      createdAt: "2026-10-05T09:00:00",
      completedAt: null,
      status: "overdue",
      scheduledDates: ["2026-10-05", "2026-10-06"],
    });
    const window = taskSpendWindow(task, "2026-10-08T12:00:00")!; // 逾期中观察
    expect(new Date(window.endEpoch).getDate()).toBe(7); // 末日 10-06 的 24:00 = 10-07 00:00
    expect(new Date(window.endEpoch).getHours()).toBe(0);
  });

  it("完成停在 completedAt；完成时刻晚于末日（逾期期完成）也截在末日 24:00", () => {
    const inWindow = makeTask({
      startedAt: "2026-10-08T09:00:00",
      createdAt: "2026-10-08T09:00:00",
      completedAt: "2026-10-08T15:00:00",
      status: "done",
      scheduledDates: ["2026-10-08", "2026-10-09"],
    });
    expect(new Date(taskSpendWindow(inWindow, "2026-10-09T12:00:00")!.endEpoch).getHours()).toBe(15);

    const afterEnd = makeTask({
      startedAt: "2026-10-01T09:00:00",
      createdAt: "2026-10-01T09:00:00",
      completedAt: "2026-10-05T10:00:00",
      status: "done",
      scheduledDates: ["2026-10-01", "2026-10-02"],
    });
    expect(new Date(taskSpendWindow(afterEnd, "2026-10-08T12:00:00")!.endEpoch).getDate()).toBe(3); // 10-02 的 24:00
  });

  it("未安排（含带未来日期的暂存任务）与窗口为空 → null", () => {
    expect(
      taskSpendWindow(
        makeTask({ startedAt: null, createdAt: "2026-10-01T08:00:00", completedAt: null, status: "unscheduled", scheduledDates: ["2026-10-20"] }),
        "2026-10-08T12:00:00",
      ),
    ).toBeNull();
    // 完成时刻早于首日 0 点（坏数据）→ 窗口为空
    expect(
      taskSpendWindow(
        makeTask({ startedAt: "2026-10-01T09:00:00", createdAt: "2026-10-01T09:00:00", completedAt: "2026-10-01T10:00:00", status: "done", scheduledDates: ["2026-10-02", "2026-10-03"] }),
        "2026-10-08T12:00:00",
      ),
    ).toBeNull();
  });

  it("迁移伪影防御：基准晚于完成时刻（旧数据回填 updatedAt 又被编辑刷新）→ 回落执行首日 00:00", () => {
    // startedAt = 回填的 updatedAt（10-08 编辑）晚于 completedAt（10-07 完成）——真实安排时刻不可知
    const task = makeTask({
      startedAt: "2026-10-08T10:00:00",
      createdAt: "2026-10-05T09:00:00",
      completedAt: "2026-10-07T15:00:00",
      status: "done",
      scheduledDates: ["2026-10-06", "2026-10-07"],
    });
    const window = taskSpendWindow(task, "2026-10-08T12:00:00")!;
    expect(new Date(window.startEpoch).getDate()).toBe(6); // 回落首日 00:00
    expect(new Date(window.startEpoch).getHours()).toBe(0);
    expect(new Date(window.endEpoch).getHours()).toBe(15); // 仍停在完成时刻
  });
});

describe("computeTaskElapsed 窗口派生", () => {
  it("当天 9 点安排、12 点观察 → 已进行 3 小时", () => {
    const elapsed = computeTaskElapsed(
      makeTask({ startedAt: "2026-10-08T09:00:00", createdAt: "2026-10-08T09:00:00", completedAt: null, status: "today", scheduledDates: ["2026-10-08"] }),
      "2026-10-08T12:00:00",
    );
    expect(elapsed).toEqual({ kind: "running", unit: "hour", value: 3 });
  });

  it("提前安排、首日 15 点完成（起点钳首日 0 点）→ 耗时 15 小时", () => {
    const elapsed = computeTaskElapsed(
      makeTask({ startedAt: "2026-10-06T10:00:00", createdAt: "2026-10-06T10:00:00", completedAt: "2026-10-08T15:00:00", status: "done", scheduledDates: ["2026-10-08"] }),
      "2026-10-09T12:00:00",
    );
    expect(elapsed).toEqual({ kind: "spent", unit: "hour", value: 15 });
  });

  it("逾期冻结值：末日 24:00 − 安排时刻（39 小时 → 1 天）", () => {
    const elapsed = computeTaskElapsed(
      makeTask({ startedAt: "2026-10-05T09:00:00", createdAt: "2026-10-05T09:00:00", completedAt: null, status: "overdue", scheduledDates: ["2026-10-05", "2026-10-06"] }),
      "2026-10-08T12:00:00",
    );
    expect(elapsed).toEqual({ kind: "running", unit: "day", value: 1 });
  });

  it("瞬间完成（completedAt = 窗口起点）钳 1 分钟；非法时间戳 → null", () => {
    expect(
      computeTaskElapsed(
        makeTask({ startedAt: "2026-10-08T09:00:00", createdAt: "2026-10-08T09:00:00", completedAt: "2026-10-08T09:00:00", status: "done", scheduledDates: ["2026-10-08"] }),
        "2026-10-08T12:00:00",
      ),
    ).toEqual({ kind: "spent", unit: "minute", value: 1 });
    expect(
      computeTaskElapsed(
        makeTask({ startedAt: "bad", createdAt: "2026-10-08T09:00:00", completedAt: "2026-10-08T15:00:00", status: "done", scheduledDates: ["2026-10-08"] }),
        "2026-10-08T12:00:00",
      ),
    ).toBeNull();
  });

  it("未安排/未来安排 → null（展示层不渲染）", () => {
    for (const status of ["unscheduled", "upcoming"] as const) {
      expect(
        computeTaskElapsed(
          makeTask({ startedAt: "2026-10-08T09:00:00", createdAt: "2026-10-08T09:00:00", completedAt: null, status, scheduledDates: ["2026-10-08"] }),
          "2026-10-08T12:00:00",
        ),
      ).toBeNull();
    }
  });
});

describe("formatMinutesCompound 复合单位（概览时间投入与气泡共用）", () => {
  it("zh：<1 小时分钟；<24 小时「N 小时 M 分」（M=0 省略）；≥24 小时「N 天 M 小时」（M=0 省略）", () => {
    expect(formatMinutesCompound(45, "zh-CN")).toBe("45 分钟");
    expect(formatMinutesCompound(60, "zh-CN")).toBe("1 小时");
    expect(formatMinutesCompound(135, "zh-CN")).toBe("2 小时 15 分");
    expect(formatMinutesCompound(1440, "zh-CN")).toBe("1 天");
    expect(formatMinutesCompound(3120, "zh-CN")).toBe("2 天 4 小时");
  });

  it("en 同构", () => {
    expect(formatMinutesCompound(45, "en-US")).toBe("45 min");
    expect(formatMinutesCompound(135, "en-US")).toBe("2 h 15 min");
    expect(formatMinutesCompound(3120, "en-US")).toBe("2 d 4 h");
  });

  it("0 分钟 = 无投入，输出占位（调用方门控渲染，不产出「0 分钟」噪音）", () => {
    expect(formatMinutesCompound(0, "zh-CN")).toBe("—");
    expect(formatMinutesCompound(0, "en-US")).toBe("—");
  });
});

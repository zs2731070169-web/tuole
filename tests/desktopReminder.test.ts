import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createDesktopReminderEngine, dueKind, localDayKey, reminderPopupPosition } = require("../electron/reminder.cjs") as {
  createDesktopReminderEngine: (deps: {
    readSettings: () => unknown;
    readTasks: () => unknown[];
    readLedger: () => unknown;
    writeLedger: (value: unknown) => void;
    deliver: (value: { title: string; body: string }) => Promise<boolean>;
    now: () => Date;
  }) => { check: () => Promise<boolean>; start: () => void; stop: () => void };
  dueKind: (task: unknown, day: string) => "today" | "overdue" | null;
  localDayKey: (date: Date) => string;
  reminderPopupPosition: (
    windowBounds: { x: number; y: number; width: number; height: number } | null,
    workArea: { x: number; y: number; width: number; height: number },
    width: number,
    height: number,
  ) => { x: number; y: number };
};

afterEach(() => vi.useRealTimers());

describe("桌面主进程提醒", () => {
  it("提醒窗跟随应用窗口，并钳在应用所在显示器的工作区", () => {
    const secondDisplay = { x: 1920, y: 0, width: 1440, height: 900 };
    expect(reminderPopupPosition({ x: 2100, y: 80, width: 1100, height: 700 }, secondDisplay, 380, 138))
      .toEqual({ x: 2804, y: 96 });
    expect(reminderPopupPosition({ x: 3300, y: 860, width: 900, height: 700 }, secondDisplay, 380, 138))
      .toEqual({ x: 2964, y: 746 });
  });

  it("按本地日期判定执行期，排除未安排、未来、已结束和草稿", () => {
    const day = "2026-10-08";
    expect(dueKind({ id: "a", scheduledDate: day, dueDate: null }, day)).toBe("today");
    expect(dueKind({ id: "b", scheduledDate: "2026-10-06", dueDate: day }, day)).toBe("today");
    expect(dueKind({ id: "c", scheduledDate: "2026-10-06", dueDate: "2026-10-07" }, day)).toBe("overdue");
    expect(dueKind({ id: "d", scheduledDate: "2026-10-09" }, day)).toBeNull();
    expect(dueKind({ id: "e", scheduledDate: null }, day)).toBeNull();
    expect(dueKind({ id: "f", scheduledDate: day, completedAt: "2026-10-08T01:00:00Z" }, day)).toBeNull();
    expect(dueKind({ id: "g", scheduledDate: day, draft: true }, day)).toBeNull();
    expect(localDayKey(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("14:12 设置在 14:13 扫描时触发，聚合今天和逾期任务，并持久去重", async () => {
    let current = new Date(2026, 9, 8, 14, 11);
    let ledger: unknown = {};
    let reminderTime = "14:12";
    let tasks = [
      { id: "today", title: "今日工作", scheduledDate: "2026-10-08", dueDate: null },
      { id: "overdue", title: "逾期工作", scheduledDate: "2026-10-04", dueDate: null },
      { id: "later", title: "未来工作", scheduledDate: "2026-10-09", dueDate: null },
    ];
    const deliver = vi.fn(async () => true);
    const deps = {
      readSettings: () => ({ reminderEnabled: true, reminderTime, language: "zh-CN" }),
      readTasks: () => tasks,
      readLedger: () => ledger,
      writeLedger: (value: unknown) => { ledger = value; },
      deliver,
      now: () => current,
    };
    const engine = createDesktopReminderEngine(deps);
    expect(await engine.check()).toBe(false);
    current = new Date(2026, 9, 8, 14, 13);
    expect(await engine.check()).toBe(true);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].title).toContain("1 项进行中 · 1 项逾期");
    expect(deliver.mock.calls[0][0].body).toContain("今日工作");
    expect(deliver.mock.calls[0][0].body).toContain("逾期工作");
    expect(await createDesktopReminderEngine(deps).check()).toBe(false); // 重启仍不重复

    reminderTime = "14:13";
    expect(await engine.check()).toBe(true); // 同日调整提醒时间，应按新设置重新提醒
    expect(deliver).toHaveBeenCalledTimes(2);

    tasks = [...tasks, { id: "new", title: "新任务", scheduledDate: "2026-10-08", dueDate: null }];
    expect(await engine.check()).toBe(true);
    expect(deliver).toHaveBeenCalledTimes(3);
    expect(deliver.mock.calls[2][0].body).toBe("新任务");
    current = new Date(2026, 9, 9, 14, 13);
    expect(await engine.check()).toBe(true); // 新的一天允许重新提醒仍未完成任务
  });

  it("投递失败不写去重账本，下一次检查继续尝试；关闭开关不投递", async () => {
    let enabled = true;
    let ledger: unknown = {};
    const deliver = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const engine = createDesktopReminderEngine({
      readSettings: () => ({ reminderEnabled: enabled, reminderTime: "14:12" }),
      readTasks: () => [{ id: "a", title: "任务", scheduledDate: "2026-10-08" }],
      readLedger: () => ledger,
      writeLedger: (value: unknown) => { ledger = value; },
      deliver,
      now: () => new Date(2026, 9, 8, 14, 13),
    });
    expect(await engine.check()).toBe(false);
    expect(ledger).toEqual({});
    expect(await engine.check()).toBe(true);
    enabled = false;
    expect(await engine.check()).toBe(false);
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("当天提醒时刻之后才创建/改动的任务当天不提醒（防与保存 toast 双弹），次日恢复正常", async () => {
    let current = new Date(2026, 9, 8, 15, 22);
    let ledger: unknown = {};
    let tasks = [
      // 刚保存的逾期任务（updatedAt 晚于 13:37 提醒时刻）——保存反馈由顶部 toast 承担，当天不再弹提醒
      { id: "fresh", title: "刚建的逾期", scheduledDate: "2026-10-02", updatedAt: new Date(2026, 9, 8, 15, 22, 5).toISOString() },
      // 历史遗留任务（无任何时间戳，兼容旧数据）——正常提醒
      { id: "old", title: "旧逾期", scheduledDate: "2026-10-05" },
      // 提醒时刻之前改动的今日任务——正常提醒
      { id: "morning", title: "早间改的今日", scheduledDate: "2026-10-08", updatedAt: new Date(2026, 9, 8, 9, 0).toISOString() },
    ];
    const deliver = vi.fn(async () => true);
    const engine = createDesktopReminderEngine({
      readSettings: () => ({ reminderEnabled: true, reminderTime: "13:37", language: "zh-CN" }),
      readTasks: () => tasks,
      readLedger: () => ledger,
      writeLedger: (value: unknown) => { ledger = value; },
      deliver,
      now: () => current,
    });
    expect(await engine.check()).toBe(true);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].body).toContain("旧逾期");
    expect(deliver.mock.calls[0][0].body).toContain("早间改的今日");
    expect(deliver.mock.calls[0][0].body).not.toContain("刚建的逾期");
    // 次日：跨日后时间戳早于次日提醒时刻，同一任务恢复正常提醒
    current = new Date(2026, 9, 9, 13, 38);
    expect(await engine.check()).toBe(true);
    expect(deliver.mock.calls[1][0].body).toContain("刚建的逾期");
  });
});

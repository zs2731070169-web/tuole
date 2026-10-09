// 提醒时间解析 + 调度器生命周期 + checkReminders 触发口径。
// 投递层（lib/notify：桌面原生 / 应用内 toast + 音效）在此 mock 掉，只锚定调度语义：
// 只提醒今天/逾期的未结束任务、聚合为一条、每任务每天一次、开关关闭不发、未到时间不发——
// 且**不依赖 Notification 权限**（2026-10 重构：旧实现无权限即整体静默，沙箱 iframe 永不触发）
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reminderMinutesOfDay,
  normalizeReminderTime,
  startScheduler,
  stopScheduler,
  checkReminders,
} from "../src/services/scheduler";
import { useTaskStore } from "../src/stores/useTaskStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";
import { todayKey, addDaysKey } from "../src/lib/date";

const deliverReminder = vi.fn();
vi.mock("../src/lib/notify", () => ({ deliverReminder: (...args: unknown[]) => deliverReminder(...args) }));

afterEach(() => {
  stopScheduler();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  deliverReminder.mockClear();
});

describe("reminderMinutesOfDay", () => {
  it("正常 HH:MM 解析为当日分钟数", () => {
    expect(reminderMinutesOfDay("09:00")).toBe(540);
    expect(reminderMinutesOfDay("00:00")).toBe(0);
    expect(reminderMinutesOfDay("23:45")).toBe(1425);
    expect(reminderMinutesOfDay("8:30")).toBe(510);
  });

  it("非法值回退默认 9:00（540）", () => {
    expect(reminderMinutesOfDay("")).toBe(540);
    expect(reminderMinutesOfDay("abc")).toBe(540);
    expect(reminderMinutesOfDay("24:00")).toBe(540);
    expect(reminderMinutesOfDay("09:60")).toBe(540);
    expect(reminderMinutesOfDay("9点")).toBe(540);
  });
});

describe("normalizeReminderTime（手动输入归一化）", () => {
  it("宽容格式归一化为 HH:MM", () => {
    expect(normalizeReminderTime("9")).toBe("09:00");
    expect(normalizeReminderTime("9:5")).toBe("09:05");
    expect(normalizeReminderTime("0930")).toBe("09:30");
    expect(normalizeReminderTime("09：30")).toBe("09:30"); // 全角冒号
    expect(normalizeReminderTime(" 23:45 ")).toBe("23:45");
  });

  it("非法输入返回 null（由 UI 回退原值）", () => {
    expect(normalizeReminderTime("")).toBeNull();
    expect(normalizeReminderTime("abc")).toBeNull();
    expect(normalizeReminderTime("24:00")).toBeNull();
    expect(normalizeReminderTime("09:60")).toBeNull();
    expect(normalizeReminderTime("9点")).toBeNull();
  });
});

describe("scheduler 生命周期", () => {
  it("重复启动仍只保留一个 visibilitychange 监听，停止时完整移除", () => {
    vi.useFakeTimers();
    const listeners = new Set<EventListener>();
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: (type: string, listener: EventListener) => {
        if (type === "visibilitychange") listeners.add(listener);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        if (type === "visibilitychange") listeners.delete(listener);
      },
    });

    startScheduler();
    startScheduler();
    expect(listeners.size).toBe(1);

    stopScheduler();
    expect(listeners.size).toBe(0);
  });
});

describe("checkReminders 触发口径（投递层已 mock，无 Notification 权限也必须投递）", () => {
  const mkTask = (id: string, title: string, day: string | null) => ({
    id, title, note: "", priority: "none", scheduledDates: day ? [day] : [], todos: [], tags: [], group: null,
    createdAt: "2026-10-01T00:00:00Z", completedAt: null, completedReason: null, sortOrder: 0,
  });

  it("已过提醒时间：只收今天/逾期任务并聚合为一条（未安排/未来不计），不依赖任何通知权限", () => {
    // 刻意不 stub Notification：沙箱 iframe 环境里它不存在/未授权，投递仍必须发生
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, reminderEnabled: true, reminderTime: "00:00" },
    }));
    useTaskStore.setState({
      tasks: [
        mkTask("t1", "今日任务", todayKey()),
        mkTask("o1", "逾期任务", addDaysKey(todayKey(), -3)),
        mkTask("u1", "未安排任务", null),
        mkTask("f1", "未来任务", addDaysKey(todayKey(), 5)),
      ],
    });
    checkReminders();
    expect(deliverReminder).toHaveBeenCalledTimes(1);
    const [title, body] = deliverReminder.mock.calls[0];
    expect(title).toContain("1");
    expect(title).toContain("1");
    expect(body).toContain("今日任务");
    expect(body).toContain("逾期任务");
    expect(body).not.toContain("未安排任务");
  });

  it("同一天再次检查不重复发（每任务每天一次）", () => {
    checkReminders();
    expect(deliverReminder).toHaveBeenCalledTimes(0);
  });

  it("开关关闭时完全不发", () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, reminderEnabled: false } }));
    useTaskStore.setState({
      tasks: [mkTask("t2", "另一今日任务", todayKey())],
    });
    checkReminders();
    expect(deliverReminder).toHaveBeenCalledTimes(0);
  });

  it("未到设定提醒时间不发（nowMinutes < fireAtMinutes 整轮跳过）", () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, reminderEnabled: true, reminderTime: "23:59" } }));
    useTaskStore.setState({ tasks: [mkTask("t3", "第三个今日任务", todayKey())] });
    checkReminders();
    expect(deliverReminder).toHaveBeenCalledTimes(0);
  });
});

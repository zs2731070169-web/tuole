// scheduler（2026-10-18 提醒重构后）：跨午夜/可见性结算的日期状态 + 进入新的一天时生成当日摘要。
// 固定时间提醒与浏览器轮询投递已下线；摘要生成收敛到 runSettlement（幂等）。
// 模块内有 lastSettledDay 闭包态，用 vi.resetModules 让每个用例拿到全新模块实例。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayKey } from "../src/lib/date";

// node 测试环境没有 DOM：scheduler 在 startScheduler 里访问 document，按需用桩替换
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => void memoryStorage.set(key, value),
  removeItem: (key: string) => void memoryStorage.delete(key),
});

/** 每个用例重置模块注册表后动态导入：scheduler 与各 store 共享同一份全新单例 */
const loadFreshModules = async () => {
  vi.resetModules();
  const [{ useMessageStore }, { useSettingsStore }, { useTaskStore }, scheduler] = await Promise.all([
    import("../src/stores/useMessageStore"),
    import("../src/stores/useSettingsStore"),
    import("../src/stores/useTaskStore"),
    import("../src/services/scheduler"),
  ]);
  return { useMessageStore, useSettingsStore, useTaskStore, scheduler };
};

const mkTodayTask = (id: string) => ({
  id,
  title: `任务${id}`,
  note: "",
  priority: "none" as const,
  scheduledDates: [todayKey()],
  startedAt: "2026-10-01T00:00:00Z",
  todos: [],
  tags: [],
  group: null,
  createdAt: "2026-10-01T00:00:00Z",
  completedAt: null,
  completedReason: null,
  sortOrder: 0,
});

afterEach(() => {
  // 定点恢复——不能 unstubAllGlobals，否则顶部桩的 localStorage 也会被卸掉
  vi.stubGlobal("document", undefined);
});

describe("scheduler 生命周期", () => {
  it("重复启动仍只保留一个 visibilitychange 监听，停止时完整移除", async () => {
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
    const { scheduler } = await loadFreshModules();

    scheduler.startScheduler();
    scheduler.startScheduler();
    expect(listeners.size).toBe(1);

    scheduler.stopScheduler();
    expect(listeners.size).toBe(0);
  });
});

describe("runSettlement 与当日摘要生成（2026-10-18 提醒重构）", () => {
  beforeEach(() => memoryStorage.clear());

  it("首次结算（= 每天首次启动）触发生成当日摘要消息", async () => {
    const { scheduler, useMessageStore, useSettingsStore, useTaskStore } = await loadFreshModules();
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, reminderEnabled: true } }));
    useTaskStore.setState({ tasks: [mkTodayTask("t1")] });

    scheduler.runSettlement();
    const messages = useMessageStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].dayKey).toBe(todayKey());
    expect(messages[0].readAt).toBeNull(); // 初始未读 → TopBar 红点
  });

  it("同一天重复结算不再生成（幂等；跨午夜后新的一天会再生成）", async () => {
    const { scheduler, useMessageStore, useSettingsStore, useTaskStore } = await loadFreshModules();
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, reminderEnabled: true } }));
    useTaskStore.setState({ tasks: [mkTodayTask("t1")] });

    scheduler.runSettlement();
    scheduler.runSettlement();
    scheduler.runSettlement();
    expect(useMessageStore.getState().messages).toHaveLength(1);
  });

  it("开关关闭时结算零副作用", async () => {
    const { scheduler, useMessageStore, useSettingsStore, useTaskStore } = await loadFreshModules();
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, reminderEnabled: false } }));
    useTaskStore.setState({ tasks: [mkTodayTask("t1")] });

    scheduler.runSettlement();
    expect(useMessageStore.getState().messages).toHaveLength(0);
  });
});

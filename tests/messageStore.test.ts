// useMessageStore（2026-10-18 消息中心）：每日摘要生成的幂等口径 + 打开即全读 + 滚动保留。
// 摘要聚合 = 状态机 today/overdue（跳过草稿/未安排/未来/已完成），生成后前插未读并写透存储。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageStore } from "../src/stores/useMessageStore";
import { useTaskStore } from "../src/stores/useTaskStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";
import { STORAGE_KEYS } from "../src/shared/constants";
import { todayKey, addDaysKey } from "../src/lib/date";
import type { AppMessage } from "../src/shared/types";

// node 测试环境没有 DOM，用内存 Map 桩替换 localStorage（persist 写透断言依赖此桩）
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => void memoryStorage.set(key, value),
  removeItem: (key: string) => void memoryStorage.delete(key),
});

const mkTask = (id: string, title: string, day: string | null) => ({
  id,
  title,
  note: "",
  priority: "none" as const,
  scheduledDates: day ? [day] : [],
  startedAt: "2026-10-01T00:00:00Z",
  todos: [],
  tags: [],
  group: null,
  createdAt: "2026-10-01T00:00:00Z",
  completedAt: null,
  completedReason: null,
  sortOrder: 0,
});

const seedMessage = (dayKey: string, read: boolean): AppMessage => ({
  id: `digest-${dayKey}`,
  kind: "dailyDigest",
  dayKey,
  createdAt: `${dayKey}T08:00:00Z`,
  readAt: read ? `${dayKey}T09:00:00Z` : null,
  digest: {
    todayCount: 2,
    overdueCount: 1,
    tasks: [
      { taskId: "t1", title: "今日任务一" },
      { taskId: "t2", title: "今日任务二" },
      { taskId: "o1", title: "逾期任务" },
    ],
    hiddenCount: 0,
  },
});

beforeEach(() => {
  useMessageStore.setState({ messages: [] });
  useTaskStore.setState({ tasks: [] });
  useSettingsStore.setState((s) => ({ settings: { ...s.settings, reminderEnabled: true } }));
  memoryStorage.clear();
});

describe("ensureDailyDigest 生成口径", () => {
  it("开关开启 + 当天有 today/overdue 任务 → 生成未读消息并写透存储", () => {
    useTaskStore.setState({
      tasks: [
        mkTask("t1", "今日任务", todayKey()),
        mkTask("o1", "逾期任务", addDaysKey(todayKey(), -3)),
        mkTask("u1", "未安排任务", null),
        mkTask("f1", "未来任务", addDaysKey(todayKey(), 5)),
      ],
    });
    const created = useMessageStore.getState().ensureDailyDigest();
    expect(created).toBe(true);

    const messages = useMessageStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: `digest-${todayKey()}`,
      dayKey: todayKey(),
      kind: "dailyDigest",
      readAt: null, // 初始未读（红点依据）
    });
    expect(messages[0].digest).toEqual({
      todayCount: 1,
      overdueCount: 1,
      tasks: [
        { taskId: "t1", title: "今日任务" },
        { taskId: "o1", title: "逾期任务" },
      ],
      hiddenCount: 0,
    });
    // 写透：localStorage 收到消息载荷
    const persisted = JSON.parse(memoryStorage.get(STORAGE_KEYS.messages)!);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].dayKey).toBe(todayKey());
  });

  it("幂等：当天重复调用不再生成（已读与否都算已生成）", () => {
    useTaskStore.setState({ tasks: [mkTask("t1", "今日任务", todayKey())] });
    expect(useMessageStore.getState().ensureDailyDigest()).toBe(true);
    useMessageStore.getState().markAllRead();
    expect(useMessageStore.getState().ensureDailyDigest()).toBe(false);
    expect(useMessageStore.getState().messages).toHaveLength(1);
  });

  it("开关关闭 → 零副作用不落消息", () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, reminderEnabled: false } }));
    useTaskStore.setState({ tasks: [mkTask("t1", "今日任务", todayKey())] });
    expect(useMessageStore.getState().ensureDailyDigest()).toBe(false);
    expect(useMessageStore.getState().messages).toHaveLength(0);
  });

  it("当天无事可报（双零）→ 不落空摘要消息", () => {
    useTaskStore.setState({
      tasks: [mkTask("u1", "未安排任务", null), mkTask("f1", "未来任务", addDaysKey(todayKey(), 5))],
    });
    expect(useMessageStore.getState().ensureDailyDigest()).toBe(false);
    expect(useMessageStore.getState().messages).toHaveLength(0);
  });

  it("草稿任务不进摘要（views 含草稿时的防御口径）", () => {
    useTaskStore.setState({
      tasks: [{ ...mkTask("d1", "草稿任务", todayKey()), draft: true } as ReturnType<typeof mkTask>],
    });
    expect(useMessageStore.getState().ensureDailyDigest()).toBe(false);
  });

  it("滚动保留最近 10 条：新消息前插、最旧的被挤出", () => {
    // 2026-09-28 → 2026-09-19：10 条旧消息，按新→旧排列（与持久化序一致）
    const oldDays = Array.from({ length: 10 }, (_, i) => `2026-09-${String(28 - i).padStart(2, "0")}`);
    useMessageStore.setState({ messages: oldDays.map((day) => seedMessage(day, true)) });
    useTaskStore.setState({ tasks: [mkTask("t1", "今日任务", todayKey())] });

    useMessageStore.getState().ensureDailyDigest();
    const messages = useMessageStore.getState().messages;
    expect(messages).toHaveLength(10);
    expect(messages[0].dayKey).toBe(todayKey()); // 最新在前
    expect(messages[9].dayKey).toBe(oldDays[8]); // 保留到第 9 旧
    expect(messages.some((m) => m.dayKey === oldDays[9])).toBe(false); // 最旧一条被挤出
  });
});

describe("markAllRead 打开即全读", () => {
  it("全部未读 → 落同一 readAt 并写透；再调零改动", () => {
    useMessageStore.setState({
      messages: [seedMessage(todayKey(), false), seedMessage(addDaysKey(todayKey(), -1), false)],
    });
    useMessageStore.getState().markAllRead();
    const messages = useMessageStore.getState().messages;
    expect(messages.every((m) => typeof m.readAt === "string")).toBe(true);
    expect(JSON.parse(memoryStorage.get(STORAGE_KEYS.messages)!).every((m: AppMessage) => m.readAt)).toBe(true);

    const before = JSON.stringify(messages);
    useMessageStore.getState().markAllRead();
    expect(JSON.stringify(useMessageStore.getState().messages)).toBe(before);
  });
});

describe("init 载入", () => {
  it("从存储键载入已存消息（刷新/重启后已读态保留）", () => {
    memoryStorage.set(
      STORAGE_KEYS.messages,
      JSON.stringify([seedMessage(todayKey(), true), seedMessage(addDaysKey(todayKey(), -1), false)]),
    );
    useMessageStore.getState().init();
    expect(useMessageStore.getState().messages).toHaveLength(2);
    expect(useMessageStore.getState().messages[0].readAt).not.toBeNull();
    expect(useMessageStore.getState().messages[1].readAt).toBeNull();
  });
});

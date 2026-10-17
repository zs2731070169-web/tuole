// 消息中心纯函数：摘要聚合口径（today/overdue，跳过草稿/未安排/未来/已完成）、
// 标题快照截断、双零不生成、消息构造与未读计数。
import { describe, expect, it } from "vitest";
import {
  buildDailyDigest,
  buildDigestMessage,
  DIGEST_TITLE_CAP,
  MAX_MESSAGES,
  digestTaskTargetDay,
  selectDigestViews,
  syncDailyDigest,
  unreadMessageCount,
} from "../src/shared/messages";
import type { AppMessage, TaskStatus, TaskView } from "../src/shared/types";

const mkView = (id: string, status: TaskStatus, extra: Partial<TaskView> = {}): TaskView => ({
  id,
  title: `任务${id}`,
  note: "",
  priority: "none",
  tags: [],
  group: null,
  scheduledDates: ["2026-10-18"],
  startedAt: null,
  todos: [],
  createdAt: "2026-10-01T00:00:00Z",
  completedAt: null,
  completedReason: null,
  sortOrder: 0,
  status,
  ...extra,
});

describe("selectDigestViews 聚合口径", () => {
  it("只收 today/overdue，排除未安排/未来/已完成与草稿", () => {
    const views = [
      mkView("t1", "today"),
      mkView("o1", "overdue"),
      mkView("u1", "unscheduled"),
      mkView("f1", "upcoming"),
      mkView("d1", "done"),
      mkView("g1", "today", { draft: true }), // 草稿防御：views 派生已排除，此处兜底
    ];
    expect(selectDigestViews(views).map((v) => v.id)).toEqual(["t1", "o1"]);
  });
});

describe("buildDailyDigest 载荷", () => {
  it("today 在前 overdue 在后拼任务引用（id + 标题快照），计数分开", () => {
    const digest = buildDailyDigest([
      mkView("o1", "overdue", { title: "逾期A" }),
      mkView("t1", "today", { title: "今日B" }),
      mkView("o2", "overdue", { title: "逾期C" }),
    ]);
    expect(digest).toEqual({
      todayCount: 1,
      overdueCount: 2,
      tasks: [
        { taskId: "t1", title: "今日B" },
        { taskId: "o1", title: "逾期A" },
        { taskId: "o2", title: "逾期C" },
      ],
      hiddenCount: 0,
    });
  });

  it(`载荷保存全部任务引用，${DIGEST_TITLE_CAP} 仅作为展示上限`, () => {
    const views = Array.from({ length: DIGEST_TITLE_CAP + 3 }, (_, i) => mkView(`t${i}`, "today"));
    const digest = buildDailyDigest(views)!;
    expect(digest.tasks).toHaveLength(DIGEST_TITLE_CAP + 3);
    expect(digest.tasks[0]).toMatchObject({ taskId: "t0" }); // today 在前、保持聚合顺序
    expect(digest.hiddenCount).toBe(0);
    expect(digest.todayCount).toBe(DIGEST_TITLE_CAP + 3); // 计数与引用都完整，UI 再限制可见行数
  });

  it("双零返回 null（不落空摘要消息）", () => {
    expect(buildDailyDigest([mkView("u1", "unscheduled"), mkView("f1", "upcoming")])).toBeNull();
    expect(buildDailyDigest([])).toBeNull();
  });
});

describe("syncDailyDigest 实时状态", () => {
  it("按当前任务库同步标题、状态与计数；已删除任务保留快照标题", () => {
    const digest = {
      todayCount: 2,
      overdueCount: 1,
      tasks: [
        { taskId: "renamed", title: "旧标题" },
        { taskId: "moved", title: "原逾期任务" },
        { taskId: "deleted", title: "已删除任务的快照" },
      ],
      hiddenCount: 0,
    };
    const synced = syncDailyDigest(digest, [
      mkView("renamed", "done", { title: "新标题" }),
      mkView("moved", "today", { title: "已改到今天" }),
    ]);

    expect(synced).toMatchObject({ todayCount: 1, overdueCount: 0, legacyHiddenCount: 0 });
    expect(synced.tasks.map((task) => ({ title: task.title, status: task.status }))).toEqual([
      { title: "新标题", status: "done" },
      { title: "已改到今天", status: "today" },
      { title: "已删除任务的快照", status: "deleted" },
    ]);
  });

  it("跳转日期优先当前仍覆盖的消息日；改期后跟随当前首日", () => {
    const spanning = mkView("span", "today", { scheduledDates: ["2026-10-18", "2026-10-19"] });
    expect(digestTaskTargetDay(spanning, "2026-10-18")).toBe("2026-10-18");
    const moved = mkView("moved", "upcoming", { scheduledDates: ["2026-11-03"] });
    expect(digestTaskTargetDay(moved, "2026-10-18")).toBe("2026-11-03");
  });
});

describe("buildDigestMessage / unreadMessageCount", () => {
  const digest = { todayCount: 1, overdueCount: 0, tasks: [{ taskId: "x", title: "a" }], hiddenCount: 0 };
  const message = buildDigestMessage("2026-10-18", digest, "2026-10-18T08:00:00Z");

  it("id 以 dayKey 派生（当日去重键）、初始未读", () => {
    expect(message.id).toBe("digest-2026-10-18");
    expect(message.kind).toBe("dailyDigest");
    expect(message.readAt).toBeNull();
  });

  it("未读计数只数 readAt 为 null 的消息", () => {
    const read: AppMessage = { ...message, id: "digest-2026-10-17", dayKey: "2026-10-17", readAt: "2026-10-17T09:00:00Z" };
    expect(unreadMessageCount([message, read])).toBe(1);
    expect(unreadMessageCount([])).toBe(0);
  });

  it(`滚动保留常量为正整数（当前 ${MAX_MESSAGES}）`, () => {
    expect(MAX_MESSAGES).toBeGreaterThan(0);
  });
});

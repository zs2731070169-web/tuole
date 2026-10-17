// storage.ts 的持久化：
// - 浏览器路径：view 读写 roundtrip 与非法值回退（刷新后停留在当前视图的回归入口）
// - 桌面路径（mock tuoleDesktop 桥）：~/.tuole 文件优先、localStorage 首启迁移、save 只写文件
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadMessages,
  loadNotes,
  loadSettings,
  loadTasks,
  loadUiState,
  saveMessages,
  saveNotes,
  saveTasks,
  saveUiState,
} from "../src/lib/storage";
import { STORAGE_KEYS } from "../src/shared/constants";
import type { AppMessage, Task } from "../src/shared/types";

// node 测试环境没有 DOM，用内存 Map 桩替换 localStorage（storage.ts 只在函数调用时访问全局，桩在导入后生效即可）
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => void memoryStorage.set(key, value),
  removeItem: (key: string) => void memoryStorage.delete(key),
});

beforeEach(() => memoryStorage.clear());

describe("loadUiState / saveUiState", () => {
  it("无持久化键时回退默认视图 all", () => {
    expect(loadUiState().view).toBe("all");
  });

  it("saveUiState 后 loadUiState 还原当前视图", () => {
    saveUiState({ view: "calendar" });
    expect(loadUiState().view).toBe("calendar");
  });

  it("备忘视图（notes，2026-10-18 第 4 视图）的持久化往返与校验通过", () => {
    saveUiState({ view: "notes" });
    expect(loadUiState().view).toBe("notes");
  });

  it("未知视图值（历史残留）回退 all", () => {
    memoryStorage.set(STORAGE_KEYS.ui, JSON.stringify({ view: "timeline" }));
    expect(loadUiState().view).toBe("all");
  });

  it("坏 JSON 回退 all 而非抛错", () => {
    memoryStorage.set(STORAGE_KEYS.ui, "{not-json");
    expect(loadUiState().view).toBe("all");
  });
});

describe("loadTasks 字段归一", () => {
  it("tags 缺失/坏形状归一为空数组，合法标签保留并去重切分", () => {
    memoryStorage.set(
      STORAGE_KEYS.tasks,
      JSON.stringify([
        demoTask, // 无 tags 字段（旧数据）
        { ...demoTask, id: "bad", tags: "不是数组" },
        { ...demoTask, id: "mixed", tags: ["工作", 42, "工作、生活"] },
      ]),
    );
    const loaded = loadTasks();
    expect(loaded[0].tags).toEqual([]);
    expect(loaded[1].tags).toEqual([]);
    expect(loaded[2].tags).toEqual(["工作", "生活"]);
  });

  it("已下线的 recurrence 字段仍被剥离", () => {
    memoryStorage.set(STORAGE_KEYS.tasks, JSON.stringify([{ ...demoTask, recurrence: "daily" }]));
    expect(loadTasks()[0]).not.toHaveProperty("recurrence");
  });

  it("group 缺失/非字符串/空白归一为 null，合法值 trim", () => {
    memoryStorage.set(
      STORAGE_KEYS.tasks,
      JSON.stringify([
        demoTask, // 无 group 字段（旧数据）
        { ...demoTask, id: "bad", group: 42 },
        { ...demoTask, id: "blank", group: "   " },
        { ...demoTask, id: "ok", group: "  产品设计 " },
      ]),
    );
    const loaded = loadTasks();
    expect(loaded[0].group).toBeNull();
    expect(loaded[1].group).toBeNull();
    expect(loaded[2].group).toBeNull();
    expect(loaded[3].group).toBe("产品设计");
  });

  it("旧 subtasks 键迁移为 todos 并剥离旧键；坏形状条目被剔除", () => {
    // 2026-10-09 内部正名：存量数据/旧快照仍用 subtasks 键，载入时折转到 todos
    const legacy = {
      ...demoTask,
      todos: undefined, // 旧数据没有 todos 键（有值时 ?? 不回退旧键）
      subtasks: [
        { id: "s1", title: "第一项", done: true },
        { id: "s2", title: "第二项", done: false },
        "junk", // 坏形状条目剔除
      ],
    };
    memoryStorage.set(STORAGE_KEYS.tasks, JSON.stringify([legacy]));
    const loaded = loadTasks()[0];
    expect(loaded.todos.map(({ title, done }) => ({ title, done }))).toEqual([
      { title: "第一项", done: true },
      { title: "第二项", done: false },
    ]);
    expect(loaded).not.toHaveProperty("subtasks");
  });
});

describe("loadNotes / saveNotes（备忘池，2026-10-18）", () => {
  it("缺键/坏 JSON/非数组 → 空数组而非抛错", () => {
    expect(loadNotes()).toEqual([]);
    memoryStorage.set(STORAGE_KEYS.notes, "{not-json");
    expect(loadNotes()).toEqual([]);
    memoryStorage.set(STORAGE_KEYS.notes, JSON.stringify({ not: "array" }));
    expect(loadNotes()).toEqual([]);
  });

  it("坏条目清洗：无 id/无标题/非对象丢弃；note 非字符串归空、createdAt 缺失补当前时刻", () => {
    memoryStorage.set(
      STORAGE_KEYS.notes,
      JSON.stringify([
        { id: "n1", title: "学滑雪", note: "冬天再说", createdAt: "2026-10-18T08:00:00.000Z" },
        { title: "无 id" }, // 丢弃
        { id: "n2", title: "   " }, // 空标题丢弃
        { id: "n3", title: "备注非字符串", note: 42 }, // note 归 ""
        "junk", // 非对象丢弃
      ]),
    );
    const loaded = loadNotes();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({ id: "n1", note: "冬天再说" });
    expect(loaded[1]).toMatchObject({ id: "n3", note: "", createdAt: expect.any(String) });
  });

  it("saveNotes → loadNotes 浏览器路径往返（含 updatedAt 保留）", () => {
    const now = new Date().toISOString();
    saveNotes([
      { id: "n1", title: "学滑雪", note: "冬天再说", createdAt: now, updatedAt: now },
    ]);
    const loaded = loadNotes();
    expect(loaded).toEqual([
      { id: "n1", title: "学滑雪", note: "冬天再说", createdAt: now, updatedAt: now },
    ]);
  });
});

describe("loadSettings 遗留键剥离", () => {
  it("已下线的 reminderTime（2026-10-18 提醒重构）载入时剥离，其余设置保留", () => {
    memoryStorage.set(
      STORAGE_KEYS.settings,
      JSON.stringify({ theme: "dark", language: "en-US", reminderEnabled: true, reminderTime: "09:00" }),
    );
    const settings = loadSettings();
    expect(settings).toMatchObject({ theme: "dark", language: "en-US", reminderEnabled: true });
    expect(settings).not.toHaveProperty("reminderTime");
  });
});

describe("loadMessages / saveMessages（消息中心，2026-10-18）", () => {
  const mkMessage = (dayKey: string, read: boolean): AppMessage => ({
    id: `digest-${dayKey}`,
    kind: "dailyDigest",
    dayKey,
    createdAt: `${dayKey}T08:00:00Z`,
    readAt: read ? `${dayKey}T09:00:00Z` : null,
    digest: { todayCount: 1, overdueCount: 0, tasks: [{ taskId: "t1", title: "任务A" }], hiddenCount: 0 },
  });

  it("缺键/坏 JSON/非数组 → 空数组而非抛错", () => {
    expect(loadMessages()).toEqual([]);
    memoryStorage.set(STORAGE_KEYS.messages, "{not-json");
    expect(loadMessages()).toEqual([]);
    memoryStorage.set(STORAGE_KEYS.messages, JSON.stringify({ not: "array" }));
    expect(loadMessages()).toEqual([]);
  });

  it("坏条目清洗：缺 id/缺 dayKey/未知 kind/坏 digest 丢弃；readAt 非字符串归 null；任务引用剔坏条目、hiddenCount 缺失归 0", () => {
    memoryStorage.set(
      STORAGE_KEYS.messages,
      JSON.stringify([
        mkMessage("2026-10-18", false),
        { dayKey: "2026-10-17" }, // 缺 id 丢弃
        { id: "digest-2026-10-16" }, // 缺 dayKey 丢弃
        { ...mkMessage("2026-10-15", false), kind: "unknown" }, // 未知 kind 丢弃
        { ...mkMessage("2026-10-14", false), digest: { todayCount: "x" } }, // 坏 digest 丢弃
        { ...mkMessage("2026-10-13", false), readAt: 42 }, // readAt 归 null（未读）
        {
          // 任务引用只收 taskId/title 双字符串条目；hiddenCount 缺失归 0
          ...mkMessage("2026-10-12", false),
          digest: {
            todayCount: 3,
            overdueCount: 0,
            tasks: [
              { taskId: "ok1", title: "合法引用" },
              { taskId: "no-title" }, // 缺 title 剔除
              { title: "缺 taskId" }, // 缺 taskId 剔除
              42, // 非对象剔除
            ],
          },
        },
        "junk", // 非对象丢弃
      ]),
    );
    const loaded = loadMessages();
    expect(loaded).toHaveLength(3);
    expect(loaded[0].dayKey).toBe("2026-10-18");
    expect(loaded[1]).toMatchObject({ dayKey: "2026-10-13", readAt: null });
    expect(loaded[2].digest).toEqual({
      todayCount: 3,
      overdueCount: 0,
      tasks: [{ taskId: "ok1", title: "合法引用" }],
      hiddenCount: 0,
    });
  });

  it("按 dayKey 降序排列（新→旧，与消息中心展示序一致）", () => {
    memoryStorage.set(
      STORAGE_KEYS.messages,
      JSON.stringify([mkMessage("2026-10-16", true), mkMessage("2026-10-18", true), mkMessage("2026-10-17", true)]),
    );
    expect(loadMessages().map((m) => m.dayKey)).toEqual(["2026-10-18", "2026-10-17", "2026-10-16"]);
  });

  it("滚动保留最近 10 条", () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-09-${String(28 - i).padStart(2, "0")}`);
    memoryStorage.set(STORAGE_KEYS.messages, JSON.stringify(days.map((day) => mkMessage(day, true))));
    const loaded = loadMessages();
    expect(loaded).toHaveLength(10);
    expect(loaded[0].dayKey).toBe("2026-09-28"); // 最新保留
    expect(loaded.some((m) => m.dayKey === "2026-09-17")).toBe(false); // 最旧两条挤出
  });

  it("saveMessages → loadMessages 浏览器路径往返", () => {
    const message = mkMessage("2026-10-18", false);
    saveMessages([message]);
    expect(loadMessages()).toEqual([message]);
  });
});

// ── 桌面文件后端（~/.tuole 分类 JSON）───────────────────────────────────────────
const demoTask: Task = {
  id: "t1",
  title: "旧版任务",
  note: "",
  priority: "none",
  scheduledDates: ["2026-10-01"],todos: [],
  tags: [],
  group: null,
  createdAt: "2026-10-01T08:00:00.000Z",
  completedAt: null,
  completedReason: null,
  sortOrder: 0,
};

// 内存文件系统桩：模拟主进程 tuole:storage:read / tuole:storage:write 的行为面
const desktopFiles = new Map<string, string>();
const desktopBridge = {
  isDesktop: true as const,
  readStorage: (file: string) => desktopFiles.get(file) ?? null,
  writeStorage: async (file: string, text: string) => {
    desktopFiles.set(file, text);
  },
};

// 让微任务链（迁移写 → 清 localStorage 键）跑完
const flushAsyncChain = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("桌面文件后端（mock tuoleDesktop 桥）", () => {
  beforeEach(() => {
    desktopFiles.clear();
    // 只桩 window、定点恢复——不能 unstubAllGlobals，否则顶部桩的 localStorage 也会被卸掉
    vi.stubGlobal("window", { tuoleDesktop: desktopBridge });
  });
  afterEach(() => {
    vi.stubGlobal("window", undefined);
  });

  it("文件有数据时优先于 localStorage（文件是唯一真相）", () => {
    desktopFiles.set("tasks.json", JSON.stringify([{ ...demoTask, id: "from-file" }]));
    memoryStorage.set(STORAGE_KEYS.tasks, JSON.stringify([{ ...demoTask, id: "from-localStorage" }]));
    const loaded = loadTasks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("from-file");
    // localStorage 的旧副本不被读也不被改
    expect(memoryStorage.get(STORAGE_KEYS.tasks)).toContain("from-localStorage");
  });

  it("文件缺失时回落 localStorage 旧数据，并异步迁移落盘后清键", async () => {
    const legacyPayload = JSON.stringify([demoTask]);
    memoryStorage.set(STORAGE_KEYS.tasks, legacyPayload);
    const loaded = loadTasks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("t1");
    await flushAsyncChain();
    // 迁移完成：文件拿到旧数据，localStorage 键被清（桌面此后不再依赖 localStorage）
    expect(desktopFiles.get("tasks.json")).toBe(legacyPayload);
    expect(memoryStorage.has(STORAGE_KEYS.tasks)).toBe(false);
  });

  it("save* 在桌面只写文件，不动 localStorage", () => {
    saveTasks([demoTask]);
    expect(desktopFiles.get("tasks.json")).toContain("旧版任务");
    expect(memoryStorage.has(STORAGE_KEYS.tasks)).toBe(false);
    saveUiState({ view: "calendar" });
    expect(desktopFiles.get("ui.json")).toContain("calendar");
  });

  it("写盘尚未完成时刷新读取最新待写任务，不回退到磁盘旧版", async () => {
    desktopFiles.set("tasks.json", JSON.stringify([demoTask]));
    let finishWrite: (() => void) | undefined;
    vi.stubGlobal("window", {
      tuoleDesktop: {
        ...desktopBridge,
        writeStorage: (file: string, text: string) => new Promise<void>((resolve) => {
          finishWrite = () => {
            desktopFiles.set(file, text);
            resolve();
          };
        }),
      },
    });

    saveTasks([{ ...demoTask, title: "新修改" }]);
    expect(loadTasks()[0].title).toBe("新修改");
    finishWrite?.();
    await flushAsyncChain();
    expect(loadTasks()[0].title).toBe("新修改");
  });

  it("ui 态从文件还原（含非法值回退默认视图）", () => {
    desktopFiles.set("ui.json", JSON.stringify({ view: "workbench" }));
    expect(loadUiState().view).toBe("workbench");
    desktopFiles.set("ui.json", "{not-json");
    expect(loadUiState().view).toBe("all");
  });

  it("备忘池走 notes.json：文件优先、首启从 localStorage 迁移、save 只写文件", async () => {
    // 文件有数据时优先于 localStorage（与任务同语义）
    desktopFiles.set("notes.json", JSON.stringify([{ id: "n1", title: "来自文件", note: "", createdAt: "2026-10-18T08:00:00.000Z" }]));
    memoryStorage.set(STORAGE_KEYS.notes, JSON.stringify([{ id: "n2", title: "来自 localStorage", note: "", createdAt: "2026-10-18T08:00:00.000Z" }]));
    expect(loadNotes().map((n) => n.id)).toEqual(["n1"]);

    // 首启迁移：文件缺失 + localStorage 有旧数据 → 异步落盘后清键
    desktopFiles.clear();
    memoryStorage.set(STORAGE_KEYS.notes, JSON.stringify([{ id: "n3", title: "迁移源", note: "", createdAt: "2026-10-18T08:00:00.000Z" }]));
    expect(loadNotes().map((n) => n.id)).toEqual(["n3"]);
    await flushAsyncChain();
    expect(desktopFiles.get("notes.json")).toContain("迁移源");
    expect(memoryStorage.has(STORAGE_KEYS.notes)).toBe(false);

    // 桌面端 save 只写文件、不动 localStorage
    saveNotes([{ id: "n4", title: "新备忘", note: "", createdAt: "2026-10-18T09:00:00.000Z" }]);
    expect(desktopFiles.get("notes.json")).toContain("新备忘");
    expect(memoryStorage.has(STORAGE_KEYS.notes)).toBe(false);
  });

  it("消息中心走 messages.json：文件优先、save 只写文件", () => {
    const message: AppMessage = {
      id: "digest-2026-10-18",
      kind: "dailyDigest",
      dayKey: "2026-10-18",
      createdAt: "2026-10-18T08:00:00.000Z",
      readAt: null,
      digest: {
        todayCount: 2,
        overdueCount: 1,
        tasks: [
          { taskId: "a", title: "任务A" },
          { taskId: "b", title: "任务B" },
          { taskId: "c", title: "任务C" },
        ],
        hiddenCount: 0,
      },
    };
    desktopFiles.set("messages.json", JSON.stringify([message]));
    memoryStorage.set(STORAGE_KEYS.messages, JSON.stringify([]));
    expect(loadMessages().map((m) => m.id)).toEqual(["digest-2026-10-18"]);

    saveMessages([{ ...message, dayKey: "2026-10-19", id: "digest-2026-10-19" }]);
    expect(desktopFiles.get("messages.json")).toContain("2026-10-19");
    // 桌面端 save 只写文件：localStorage 残留的旧副本保持原样（文件是唯一真相）
    expect(memoryStorage.get(STORAGE_KEYS.messages)).toBe("[]");
  });
});

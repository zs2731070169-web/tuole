// storage.ts 的持久化：
// - 浏览器路径：view 读写 roundtrip 与非法值回退（刷新后停留在当前视图的回归入口）
// - 桌面路径（mock tuoleDesktop 桥）：~/.tuole 文件优先、localStorage 首启迁移、save 只写文件
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadTasks, loadUiState, saveTasks, saveUiState } from "../src/lib/storage";
import { STORAGE_KEYS } from "../src/shared/constants";
import type { Task } from "../src/shared/types";

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
});

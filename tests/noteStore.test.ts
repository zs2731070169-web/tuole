// useNoteStore（2026-10-18 备忘池）：CRUD 写透持久化 + convertNoteToTask 的转正口径——
// 不默认今天，必须由转换侧边栏显式给出单日；确认后才建任务并移除备忘
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../src/stores/useNoteStore";
import { useTaskStore } from "../src/stores/useTaskStore";
import { STORAGE_KEYS } from "../src/shared/constants";
import { computeAutoStatus } from "../src/shared/statusMachine";
import { bucketWorkbenchColumns } from "../src/shared/workbench";

// node 测试环境没有 DOM，用内存 Map 桩替换 localStorage（persist 写透断言依赖此桩）
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => void memoryStorage.set(key, value),
  removeItem: (key: string) => void memoryStorage.delete(key),
});

const resetStores = () => {
  useNoteStore.setState({ notes: [] });
  useTaskStore.setState({ tasks: [] });
  memoryStorage.clear();
};

beforeEach(resetStores);

describe("useNoteStore CRUD 写透", () => {
  it("init 从存储键载入；缺键回空数组", () => {
    expect(useNoteStore.getState().notes).toEqual([]);
    memoryStorage.set(
      STORAGE_KEYS.notes,
      JSON.stringify([{ id: "n1", title: "学滑雪", note: "冬天再说", createdAt: "2026-10-18T08:00:00.000Z" }]),
    );
    useNoteStore.getState().init();
    expect(useNoteStore.getState().notes.map((n) => n.id)).toEqual(["n1"]);
  });

  it("createNote 前插（最新在前）、返回完整条目并写透存储", () => {
    const first = useNoteStore.getState().createNote({ title: "第一条", note: "" });
    const second = useNoteStore.getState().createNote({ title: "第二条", note: "备注" });

    expect(useNoteStore.getState().notes.map((n) => n.title)).toEqual(["第二条", "第一条"]);
    expect(second).toMatchObject({ title: "第二条", note: "备注" });
    expect(typeof second.createdAt).toBe("string");
    const persisted = JSON.parse(memoryStorage.get(STORAGE_KEYS.notes)!);
    expect(persisted.map((n: { title: string }) => n.title)).toEqual(["第二条", "第一条"]);
    // 无草稿机制：create 后立即持久化，无 draft 标记
    expect(persisted[0].draft).toBeUndefined();
    expect(first.id).not.toBe(second.id);
  });

  it("updateNote 只改目标条目、落 updatedAt、保持数组序", () => {
    const a = useNoteStore.getState().createNote({ title: "A", note: "" });
    useNoteStore.getState().createNote({ title: "B", note: "" });
    useNoteStore.getState().updateNote(a.id, { title: "A 改", note: "补备注" });

    const notes = useNoteStore.getState().notes;
    expect(notes.map((n) => n.title)).toEqual(["B", "A 改"]); // 序不变（A 仍在后位）
    expect(notes[1]).toMatchObject({ note: "补备注", updatedAt: expect.any(String) });
    expect(notes[1]!.id).toBe(a.id);
  });

  it("deleteNote 只移除目标并写透", () => {
    const a = useNoteStore.getState().createNote({ title: "A", note: "" });
    useNoteStore.getState().createNote({ title: "B", note: "" });
    useNoteStore.getState().deleteNote(a.id);
    expect(useNoteStore.getState().notes.map((n) => n.title)).toEqual(["B"]);
    expect(JSON.parse(memoryStorage.get(STORAGE_KEYS.notes)!)).toHaveLength(1);
  });
});

describe("importNotes（Excel 只添加新导入）", () => {
  it("新增追加数组尾并写透；命中存量（id 或 标题+创建时间）跳过", () => {
    useNoteStore.getState().createNote({ title: "存量备忘", note: "" });
    const existing = useNoteStore.getState().notes[0]!;

    const result = useNoteStore.getState().importNotes([
      { id: "new-1", title: "导入的新备忘", note: "来自文件", createdAt: "2026-10-17T08:00:00.000Z" },
      existing, // id 命中
      { id: "whatever", title: "存量备忘", note: "", createdAt: existing.createdAt }, // 标题+时间命中
    ]);
    expect(result).toEqual({ added: 1, existed: 2 });
    const notes = useNoteStore.getState().notes;
    expect(notes.map((n) => n.title)).toEqual(["存量备忘", "导入的新备忘"]); // 追加在尾
    expect(JSON.parse(memoryStorage.get(STORAGE_KEYS.notes)!)).toHaveLength(2);
  });

  it("全部命中时零改动不写盘（幂等重复导入）", () => {
    const note = useNoteStore.getState().createNote({ title: "存量备忘", note: "" });
    memoryStorage.clear(); // 清掉 createNote 的写盘痕迹，验证「无新增不 persist」
    const result = useNoteStore.getState().importNotes([note]);
    expect(result).toEqual({ added: 0, existed: 1 });
    expect(memoryStorage.has(STORAGE_KEYS.notes)).toBe(false);
  });
});

describe("convertNoteToTask（转为任务）", () => {
  it("按用户显式选择的单日转正：未开始、无 draft，备忘移除并写透", () => {
    const note = useNoteStore.getState().createNote({ title: "学滑雪", note: "冬天再说" });
    const selectedDay = "2026-11-03";

    // 只创建备忘、尚未在侧边栏确认时，任务库保持为空
    expect(useTaskStore.getState().tasks).toEqual([]);
    const task = useNoteStore.getState().convertNoteToTask(note.id, {
      title: "学滑雪（室内课）",
      note: "先体验一次",
      scheduledDay: selectedDay,
    });

    expect(task).not.toBeNull();
    expect(task).toMatchObject({
      title: "学滑雪（室内课）",
      note: "先体验一次",
      scheduledDates: [selectedDay],
      startedAt: null,
      parkedDate: null,
      completedAt: null,
    });
    // 无 draft 标记（真任务，非草稿——closeEditor 的草稿回收不会误伤它）
    expect(task!.draft).toBeUndefined();
    // 任务已入任务库；状态机派生 = 未安排
    const inStore = useTaskStore.getState().tasks.find((t) => t.id === task!.id);
    expect(inStore).toBeDefined();
    expect(computeAutoStatus(inStore!, { now: new Date() })).toBe("unscheduled");
    // 工作台分桶：只落用户所选日的「未安排」栏，不会自动出现在今天
    const views = useTaskStore.getState().views().filter((v) => v.id === task!.id);
    const columns = bucketWorkbenchColumns(views, selectedDay);
    expect(columns.unscheduled.map((v) => v.id)).toEqual([task!.id]);
    // 备忘已从池中移除并持久化
    expect(useNoteStore.getState().notes).toEqual([]);
    expect(JSON.parse(memoryStorage.get(STORAGE_KEYS.notes)!)).toEqual([]);
  });

  it("未知 id 返回 null、两个 store 零改动", () => {
    useNoteStore.getState().createNote({ title: "存量的备忘", note: "" });
    const taskCountBefore = useTaskStore.getState().tasks.length;
    const noteCountBefore = useNoteStore.getState().notes.length;

    expect(useNoteStore.getState().convertNoteToTask("不存在的id", {
      title: "无效",
      note: "",
      scheduledDay: "2026-11-03",
    })).toBeNull();
    expect(useTaskStore.getState().tasks).toHaveLength(taskCountBefore);
    expect(useNoteStore.getState().notes).toHaveLength(noteCountBefore);
  });

  it("未选择日期时拒绝转正：任务不创建、备忘不移除", () => {
    const note = useNoteStore.getState().createNote({ title: "等确认日期", note: "" });
    memoryStorage.clear();

    expect(useNoteStore.getState().convertNoteToTask(note.id, {
      title: note.title,
      note: note.note,
      scheduledDay: "",
    })).toBeNull();
    expect(useTaskStore.getState().tasks).toEqual([]);
    expect(useNoteStore.getState().notes.map((item) => item.id)).toEqual([note.id]);
    expect(memoryStorage.size).toBe(0);
  });
});

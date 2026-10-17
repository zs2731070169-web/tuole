// 备忘 store（2026-10-18 新增）：「未来某一天可能会安排、现在还不确定」的任务暂存池。
// 独立实体、独立持久化，不参与任务的状态机/筛选/统计/Excel/备份/提醒任何链路。
// 无草稿机制：备忘创建零副作用，create 到「保存」前零持久化（与任务的 draft 机制刻意不同）
import { create } from "zustand";
import type { NoteItem, Task } from "../shared/types";
import { loadNotes, saveNotes } from "../lib/storage";
import { planNotesImport } from "../shared/notes";
import { makeId, useTaskStore } from "./useTaskStore";

interface ConvertNoteInput {
  title: string;
  note: string;
  scheduledDay: string;
}

interface NoteState {
  notes: NoteItem[];
  init: () => void;
  persist: () => void;
  createNote: (input: { title: string; note: string }) => NoteItem;
  updateNote: (id: string, input: { title: string; note: string }) => void;
  deleteNote: (id: string) => void;
  /** 备忘 Excel 导入（2026-10-18）：只添加新——去重规划见 shared/notes.planNotesImport
   *  （id 精确 + 标题+创建时间 fallback），已存在跳过；返回新增/跳过计数 */
  importNotes: (incoming: NoteItem[]) => { added: number; existed: number };
  /** 转为正式任务：必须由转换抽屉显式给出安排日；打开抽屉本身不写入任何 store。
   *  确认后创建 scheduledDates:[所选日] + startedAt:null 的无草稿任务，并移除原备忘。
   *  不存在 id、空标题或空日期 → null，两个 store 均零改动。 */
  convertNoteToTask: (id: string, input: ConvertNoteInput) => Task | null;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  init: () => set({ notes: loadNotes() }),
  persist: () => saveNotes(get().notes),
  // 前插：数组序即展示序（最新在前），列表按 createdAt 降序渲染
  createNote: ({ title, note }) => {
    const item: NoteItem = {
      id: makeId(),
      title,
      note,
      createdAt: new Date().toISOString(),
    };
    set({ notes: [item, ...get().notes] });
    get().persist();
    return item;
  },
  updateNote: (id, { title, note }) => {
    set({
      notes: get().notes.map((item) =>
        item.id === id ? { ...item, title, note, updatedAt: new Date().toISOString() } : item,
      ),
    });
    get().persist();
  },
  deleteNote: (id) => {
    set({ notes: get().notes.filter((item) => item.id !== id) });
    get().persist();
  },
  // 导入追加在数组尾（列表按 createdAt 降序渲染，数组序不影响展示；导入多为历史记录）
  importNotes: (incoming) => {
    const plan = planNotesImport(get().notes, incoming);
    if (plan.added.length > 0) {
      set({ notes: [...get().notes, ...plan.added] });
      get().persist();
    }
    return { added: plan.added.length, existed: plan.existed };
  },
  // 跨 store 单向调用（useNoteStore → useTaskStore，无环）：转换抽屉确认后才进入这里，
  // 集中完成「按用户所选日期建任务 + 删备忘」；打开/关闭抽屉期间零持久化副作用。
  convertNoteToTask: (id, input) => {
    const source = get().notes.find((item) => item.id === id);
    if (!source || input.title.trim() === "" || input.scheduledDay.trim() === "") return null;
    const task = useTaskStore.getState().createTask({
      title: input.title,
      note: input.note,
      scheduledDates: [input.scheduledDay],
      startedAt: null,
      parkedDate: null,
    });
    set({ notes: get().notes.filter((item) => item.id !== id) });
    get().persist();
    return task;
  },
}));

// 任务 store：CRUD、子任务、批量操作、拖拽改期/顺延/结束
// 红线：status 永不作为可写字段暴露；所有结束动作只写 completedAt/completedReason
import { create } from "zustand";
import type { Task, TaskView, Priority, Subtask, CompletedReason } from "../shared/types";
import { computeAutoStatus } from "../shared/statusMachine";
import { loadTasks, saveTasks } from "../lib/storage";
import { useSettingsStore } from "./useSettingsStore";
import { rollOverTarget as calcRollOver, todayKey, addDaysKey } from "../lib/date";
import { planExcelImport, type ExcelImportMode, type ExcelImportPlan } from "../shared/excelImport";
import { movedSchedule } from "../shared/taskDates";

export function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyTask(partial: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: "",
    note: "",
    priority: "none",
    scheduledDate: null,
    dueDate: null,
    subtasks: [],
    createdAt: now,
    completedAt: null,
    completedReason: null,
    sortOrder: Date.now(),
    ...partial,
  };
}

interface TaskState {
  tasks: Task[];
  init: () => void;
  persist: () => void;
  // 派生视图：给每个任务附加计算出的 status
  views: () => TaskView[];
  createTask: (partial?: Partial<Task>) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTasks: (ids: string[]) => void;
  // 自动流转触发点（用户只做这三类动作）
  scheduleTo: (id: string, dateKey: string | null, parkedOn?: string) => void;
  rollOver: (ids: string[]) => void;
  complete: (ids: string[], reason: CompletedReason) => void;
  reopenByDate: (id: string, dateKey: string) => void; // done 改回未来日期 -> upcoming
  setPriorityBatch: (ids: string[], p: Priority) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subId: string) => void;
  renameSubtask: (taskId: string, subId: string, title: string) => void;
  removeSubtask: (taskId: string, subId: string) => void;
  reorder: (orderedIds: string[]) => void;
  discardEmptyDraft: (id: string) => boolean;
  purgeEmptyDrafts: () => number;
  // JSON/快照全量恢复与 Excel 的按任务匹配导入分别使用不同入口。
  importTasks: (tasks: Task[], mode: "merge" | "replace") => number;
  importExcelTasks: (tasks: Task[], mode: ExcelImportMode) => ExcelImportPlan;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  init: () => {
    // 一次性迁移：未安排任务补齐「停靠日」（历史无日期全局池统一停靠今天），
    // 让未安排与进行中一样跟着日期走、按日隔离（2026-10 用户决策）
    const today = todayKey();
    let changed = false;
    const tasks = loadTasks().map((t) => {
      if (!t.scheduledDate && !t.completedAt && !t.parkedDate) {
        changed = true;
        return { ...t, parkedDate: today };
      }
      return t;
    });
    set({ tasks });
    if (changed) get().persist();
  },
  persist: () => saveTasks(get().tasks),
  views: () => {
    const now = new Date();
    return get().tasks.map((t) => ({
      ...t,
      status: computeAutoStatus(t, { now }),
    }));
  },
  createTask: (partial) => {
    // updatedAt：当天提醒时刻之后新建的任务当天不进提醒（见 types.ts 注释）
    const task = { ...emptyTask(partial), updatedAt: new Date().toISOString() };
    set({ tasks: [task, ...get().tasks] });
    get().persist();
    return task;
  },
  updateTask: (id, patch) => {
    set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)) });
    get().persist();
  },
  deleteTasks: (ids) => {
    set({ tasks: get().tasks.filter((t) => !ids.includes(t.id)) });
    get().persist();
  },
  scheduleTo: (id, dateKey, parkedOn) => {
    // 被安排日期 -> upcoming/today（正式开展，停靠日清空、由 scheduledDate 接管）；
    // 清空日期 -> 回到未安排，停靠在指定日（拖回未安排栏传工作台选中日，默认今天）
    set({
      tasks: get().tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              ...movedSchedule(t, dateKey),
              completedAt: null,
              completedReason: null,
              parkedDate: dateKey === null ? (parkedOn ?? todayKey()) : null,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    });
    get().persist();
  },
  rollOver: (ids) => {
    const target = useSettingsStore.getState().settings.rollOverTarget;
    const today = todayKey();
    const newDate = calcRollOver(today, target);
    set({
      tasks: get().tasks.map((t) =>
        ids.includes(t.id) ? { ...t, ...movedSchedule(t, newDate), completedAt: null, completedReason: null } : t,
      ),
    });
    get().persist();
  },
  complete: (ids, reason) => {
    const now = new Date().toISOString();
    set({
      tasks: get().tasks.map((t) =>
        ids.includes(t.id) ? { ...t, completedAt: now, completedReason: reason } : t,
      ),
    });
    get().persist();
  },
  reopenByDate: (id, dateKey) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === id
          ? { ...t, ...movedSchedule(t, dateKey), completedAt: null, completedReason: null, updatedAt: new Date().toISOString() }
          : t,
      ),
    });
    get().persist();
  },
  setPriorityBatch: (ids, p) => {
    set({ tasks: get().tasks.map((t) => (ids.includes(t.id) ? { ...t, priority: p } : t)) });
    get().persist();
  },
  addSubtask: (taskId, title) => {
    const sub: Subtask = { id: makeId(), title, done: false };
    set({ tasks: get().tasks.map((t) => (t.id === taskId ? { ...t, subtasks: [...t.subtasks, sub] } : t)) });
    get().persist();
  },
  toggleSubtask: (taskId, subId) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === taskId ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)) } : t,
      ),
    });
    get().persist();
  },
  renameSubtask: (taskId, subId, title) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === taskId ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, title } : s)) } : t,
      ),
    });
    get().persist();
  },
  removeSubtask: (taskId, subId) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === taskId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) } : t,
      ),
    });
    get().persist();
  },
  reorder: (orderedIds) => {
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    set({ tasks: get().tasks.map((t) => (rank.has(t.id) ? { ...t, sortOrder: rank.get(t.id)! } : t)) });
    get().persist();
  },
  // 关闭编辑抽屉时回收：未保存草稿（draft 标记，无论是否已输入标题）或空标题任务 -> 整条丢弃，不留幽灵任务
  discardEmptyDraft: (id: string) => {
    const t = get().tasks.find((x) => x.id === id);
    if (!t || (t.title.trim() !== "" && t.draft !== true)) return false;
    set({ tasks: get().tasks.filter((x) => x.id !== id) });
    get().persist();
    return true;
  },
  // 清理历史遗留的草稿：draft 标记（未点保存）或空标题任务（旧版本「先建后填」脏数据）
  purgeEmptyDrafts: () => {
    const removed = get().tasks.filter((t) => t.draft === true || !t.title.trim()).length;
    if (removed === 0) return 0;
    set({ tasks: get().tasks.filter((t) => t.draft !== true && t.title.trim() !== "") });
    get().persist();
    console.log("[妥了] purgeEmptyDrafts: 清理草稿/空标题任务", removed, "条");
    return removed;
  },
  // 全量恢复与旧接口：JSON/快照的 replace 仍是完整恢复。
  importTasks: (tasks, mode) => {
    if (mode === "replace") {
      set({ tasks });
      get().persist();
      return tasks.length;
    }
    const byId = new Map(get().tasks.map((t) => [t.id, t]));
    let added = 0;
    for (const t of tasks) {
      if (!byId.has(t.id)) added++;
      byId.set(t.id, t);
    }
    const merged = Array.from(byId.values()).sort((a, b) => b.sortOrder - a.sortOrder);
    set({ tasks: merged });
    get().persist();
    return added;
  },
  importExcelTasks: (tasks, mode) => {
    const plan = planExcelImport(get().tasks, tasks, mode);
    if (plan.added > 0 || plan.updated > 0) {
      set({ tasks: plan.tasks });
      get().persist();
    }
    return plan;
  },
}));

export { emptyTask };

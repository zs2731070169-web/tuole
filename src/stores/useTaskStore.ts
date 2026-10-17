// 任务 store：CRUD、待办项、批量操作、拖拽改期/顺延/结束。
// 待办项 2026-10-09 完成全量正名：内部字段/动作统一为 todos 系（旧数据键由 storage.ts 迁移单点折转）
// 红线：status 永不作为可写字段暴露；所有结束动作只写 completedAt/completedReason
import { create } from "zustand";
import type { Task, TaskView, Priority, Todo, CompletedReason } from "../shared/types";
import { computeAutoStatus } from "../shared/statusMachine";
import { loadTasks, saveTasks, sanitizeTaskEntries } from "../lib/storage";
import { useSettingsStore } from "./useSettingsStore";
import { rollOverTarget as calcRollOver, todayKey, addDaysKey } from "../lib/date";
import { planExcelImport, type ExcelImportMode, type ExcelImportPlan, type ExcelImportOptions } from "../shared/excelImport";
import { movedDay, movedSchedule, rollOverBaseDate } from "../shared/taskDates";
import { planDeleteDaysPrune } from "../shared/calendar";

export function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyTask(partial: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  const scheduledDates = partial.scheduledDates ?? [];
  const startedAt = partial.startedAt === undefined
    ? (scheduledDates.length > 0 ? now : null)
    : partial.startedAt;
  return {
    id: makeId(),
    title: "",
    note: "",
    priority: "none",
    tags: [],
    group: null,
    todos: [],
    createdAt: now,
    completedAt: null,
    completedReason: null,
    sortOrder: Date.now(),
    ...partial,
    scheduledDates,
    startedAt,
  };
}

// 整条克隆的字段口径（浮层「复制」按钮与 ⌥ 拖拽复制共用，2026-10-10）：字段全量复制、
// 集合浅拷防共享引用；todos 逐项换 id 且 done 清零（副本是全新执行）；完成态/草稿清空
// （副本 status 完全由状态机派生）；身份/时间戳全新
function buildTaskClone(source: Task): Task {
  const now = new Date().toISOString();
  return {
    ...source,
    id: makeId(),
    tags: [...source.tags],
    scheduledDates: [...source.scheduledDates],
    todos: source.todos.map((todo) => ({ ...todo, id: makeId(), done: false })),
    completedAt: null,
    completedReason: null,
    startedAt: null,
    draft: false,
    createdAt: now,
    updatedAt: now,
    sortOrder: Date.now(),
  };
}

interface TaskState {
  tasks: Task[];
  init: () => void;
  persist: () => void;
  // 派生视图：给每个任务附加计算出的 status
  views: () => TaskView[];
  createTask: (partial?: Partial<Task>) => Task;
  // 日历浮层「复制」（2026-10-10 用户决策）：原地整条克隆，归位走既有拖拽——
  // 克隆是全字段等价副本，拖源或拖副本终态任务集合相同，不存在「拖错」
  duplicateTask: (id: string, parkedOn?: string) => Task | null;
  // ⌥(Alt)+拖拽复制（2026-10-10 用户决策 + 同日实测修正）：**单日副本**——克隆任务
  // 内容、副本执行期只落目标日一天（与移动/删除同款逐日语义；整段平移版实测会让副本
  // 跨多日并在源的其余日冒出重复 chip，违背「复制这一天」心智，已废弃勿回）
  duplicateTaskToDay: (id: string, toDay: string) => Task | null;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTasks: (ids: string[]) => void;
  // 日历「按日期删除」（2026-10-10 用户决策：删一天只移除那一天）：多天任务修剪所选日、
  // 仅剩所选日/停靠命中/完成日命中的整条删除——规划见 shared/calendar.planDeleteDaysPrune
  deleteDaysFromTasks: (days: string[]) => void;
  /** 单任务单日删除：多天任务只修剪被点的那一天（与「按日期删除」同源语义），其余日期保留 */
  deleteTaskDay: (id: string, day: string) => void;
  // 自动流转触发点（用户只做这三类动作）
  scheduleTo: (id: string, dateKey: string | null, parkedOn?: string) => void;
  startTask: (id: string) => void;
  markUnscheduled: (id: string) => void;
  // 日历格拖拽落点（2026-10-09 用户定调）：把 fromDay 那一天挪到 toDay，其余日期零改动
  moveTaskDay: (id: string, fromDay: string, toDay: string) => void;
  rollOver: (ids: string[]) => void;
  complete: (ids: string[], reason: CompletedReason) => void;
  reopen: (id: string) => void;
  setPriorityBatch: (ids: string[], p: Priority) => void;
  addTodo: (taskId: string, title: string) => void;
  toggleTodo: (taskId: string, todoId: string) => void;
  renameTodo: (taskId: string, todoId: string, title: string) => void;
  removeTodo: (taskId: string, todoId: string) => void;
  reorder: (orderedIds: string[]) => void;
  discardEmptyDraft: (id: string) => boolean;
  purgeEmptyDrafts: () => number;
  // JSON/快照全量恢复与 Excel 的按任务匹配导入分别使用不同入口。
  importTasks: (tasks: Task[], mode: "merge" | "replace") => number;
  importExcelTasks: (tasks: Task[], mode: ExcelImportMode, options?: ExcelImportOptions) => ExcelImportPlan;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  init: () => {
    // 一次性迁移：未安排任务补齐「停靠日」（历史无日期全局池统一停靠今天），
    // 让未安排与进行中一样跟着日期走、按日隔离（2026-10 用户决策）
    const today = todayKey();
    let changed = false;
    const tasks = loadTasks().map((t) => {
      if (t.scheduledDates.length === 0 && !t.completedAt && !t.parkedDate) {
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
    const task = { ...emptyTask(partial), updatedAt: new Date().toISOString() };
    set({ tasks: [task, ...get().tasks] });
    get().persist();
    return task;
  },
  // 复制一律回到「未安排」，但日期仍然存在并落在复制所在日。
  duplicateTask: (id, parkedOn) => {
    const source = get().tasks.find((task) => task.id === id);
    if (!source) return null;
    const clone: Task = {
      ...buildTaskClone(source),
      scheduledDates: [parkedOn ?? source.scheduledDates[0] ?? source.parkedDate ?? todayKey()],
      parkedDate: null,
      startedAt: null,
    };
    // 插入源任务紧后（数组序 = 日历格/概览展示序）：浮层里副本行与源行相邻呈现即复制反馈
    set({ tasks: get().tasks.flatMap((task) => (task.id === id ? [task, clone] : [task])) });
    get().persist();
    return clone;
  },
  duplicateTaskToDay: (id, toDay) => {
    const source = get().tasks.find((task) => task.id === id);
    if (!source) return null;
    const clone: Task = {
      ...buildTaskClone(source),
      // 单日副本：只落目标日（源任务零改动）
      scheduledDates: [toDay],
      parkedDate: null,
      startedAt: null,
    };
    set({ tasks: get().tasks.flatMap((task) => (task.id === id ? [task, clone] : [task])) });
    get().persist();
    return clone;
  },
  updateTask: (id, patch) => {
    set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)) });
    get().persist();
  },
  deleteTasks: (ids) => {
    set({ tasks: get().tasks.filter((t) => !ids.includes(t.id)) });
    get().persist();
  },
  deleteDaysFromTasks: (days) => {
    const plan = planDeleteDaysPrune(get().tasks, days, todayKey());
    if (plan.deleteIds.length === 0 && plan.prunes.length === 0) return;
    const deleteSet = new Set(plan.deleteIds);
    const pruneById = new Map(plan.prunes.map((prune) => [prune.id, prune.scheduledDates]));
    const now = new Date().toISOString();
    set({
      tasks: get()
        .tasks.filter((t) => !deleteSet.has(t.id))
        .map((t) => {
          const remaining = pruneById.get(t.id);
          // 修剪落 updatedAt：与手动编辑同口径（编辑审计戳，见 types.ts 注释）
          return remaining ? { ...t, scheduledDates: remaining, updatedAt: now } : t;
        }),
    });
    get().persist();
  },
  // 单任务单日删除（2026-10-10 用户反馈：29/30 两天是同一条多天任务，点 29 号的删除钮把
  // 30 号也连带删了——整条删除语义错，用户要的是「只删被点的那一天」）。语义与「按日期删除」
  // 同源：planDeleteDaysPrune 以单任务 × 单日调用——多天覆盖该日 → 修剪（任务保留）；
  // 单日任务 / 未安排停靠命中 / 已完成完成日命中 → 整条删除；该日不属此任务 → 防御性无操作
  deleteTaskDay: (id, day) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task) return;
    const plan = planDeleteDaysPrune([task], [day], todayKey());
    if (plan.deleteIds.includes(id)) {
      set({ tasks: get().tasks.filter((item) => item.id !== id) });
    } else {
      const prune = plan.prunes.find((entry) => entry.id === id);
      if (!prune) return;
      // 修剪落 updatedAt：与手动编辑/按日期删除同口径（编辑审计戳）
      set({
        tasks: get().tasks.map((item) =>
          item.id === id
            ? { ...item, scheduledDates: prune.scheduledDates, updatedAt: new Date().toISOString() }
            : item,
        ),
      });
    }
    get().persist();
  },
  scheduleTo: (id, dateKey, parkedOn) => {
    // 只改任务日期，不改未安排/进行中/已完成生命周期。
    // null 是旧调用兼容值；新口径下日期始终存在，因此不执行清空。
    if (!dateKey) return;
    set({
      tasks: get().tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              ...movedSchedule(t, dateKey),
              parkedDate: parkedOn ?? null,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    });
    get().persist();
  },
  startTask: (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task || task.completedAt || task.startedAt !== null) return;
    const now = new Date().toISOString();
    set({ tasks: get().tasks.map((item) => item.id === id ? { ...item, startedAt: now, updatedAt: now } : item) });
    get().persist();
  },
  markUnscheduled: (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task || task.completedAt || task.startedAt === null) return;
    const now = new Date().toISOString();
    set({ tasks: get().tasks.map((item) => item.id === id ? { ...item, startedAt: null, updatedAt: now } : item) });
    get().persist();
  },
  // 日历格拖拽落点（2026-10-09 用户定调）：把 fromDay 那一天挪到 toDay，其余日期零改动
  moveTaskDay: (id, fromDay, toDay) => {
    // 落点语义见 shared/taskDates.movedDay；只改日期与停靠日（parkedDate 置空由执行期接管），
    // 不改生命周期：completedAt/completedReason/startedAt 原样保留（2026-10-10 日期与生命
    // 周期解耦定调——已完成任务移格保持完成态）。**源日不在集合内 = 真无操作（不 set /
    // 不 persist）**：无操作却照落副作用会把停靠日清掉——未安排 chip（空集合）拖放后 byDay
    // 的「parkedDate ?? 今天」兜底会让它瞬移进今天格（2026-10-10 用户实测「拖到哪都跑进今日格子」的根因）
    const task = get().tasks.find((t) => t.id === id);
    if (!task || !task.scheduledDates.includes(fromDay)) return;
    set({
      tasks: get().tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              scheduledDates: movedDay(t, fromDay, toDay),
              parkedDate: null,
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
    set({
      tasks: get().tasks.map((t) =>
        ids.includes(t.id)
          ? {
              ...t,
              // 顺延基准逐任务取 max(今天, 执行期结束日)：未来任务从自己的结束日起再推一天，
              // 今天/逾期任务仍从今天推到设置的目标日（逾期 = 追赶上进度）
              ...movedSchedule(t, calcRollOver(rollOverBaseDate(t, today), target)),
              completedAt: null,
              completedReason: null,
            }
          : t,
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
  reopen: (id) => {
    const now = new Date().toISOString();
    set({
      tasks: get().tasks.map((t) =>
        t.id === id
          ? { ...t, startedAt: t.startedAt ?? now, completedAt: null, completedReason: null, updatedAt: now }
          : t,
      ),
    });
    get().persist();
  },
  setPriorityBatch: (ids, p) => {
    set({ tasks: get().tasks.map((t) => (ids.includes(t.id) ? { ...t, priority: p } : t)) });
    get().persist();
  },
  addTodo: (taskId, title) => {
    const todoItem: Todo = { id: makeId(), title, done: false };
    set({ tasks: get().tasks.map((t) => (t.id === taskId ? { ...t, todos: [...t.todos, todoItem] } : t)) });
    get().persist();
  },
  toggleTodo: (taskId, todoId) => {
    // 已完成任务的待办项勾选锁定（2026-10-17 用户决策「已完成待办项全默认打勾」的写路径
    // 防御）：展示层一律派生为已勾选，此处拒绝改写真实勾选进度——真无操作（不 set /
    // 不 persist），重新打开任务后才能继续勾选。UI 侧勾选按钮同口径 disabled
    const task = get().tasks.find((item) => item.id === taskId);
    if (!task || task.completedAt) return;
    set({
      tasks: get().tasks.map((t) =>
        t.id === taskId ? { ...t, todos: t.todos.map((item) => (item.id === todoId ? { ...item, done: !item.done } : item)) } : t,
      ),
    });
    get().persist();
  },
  renameTodo: (taskId, todoId, title) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === taskId ? { ...t, todos: t.todos.map((item) => (item.id === todoId ? { ...item, title } : item)) } : t,
      ),
    });
    get().persist();
  },
  removeTodo: (taskId, todoId) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === taskId ? { ...t, todos: t.todos.filter((item) => item.id !== todoId) } : t,
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
  // 外部任务形状归一统一走 storage.sanitizeTaskEntries（与 loadTasks 同一口径）：旧快照/旧导出
  // JSON 的任务缺字段或用旧键，若原样进 store，工作台 TaskItem 渲染会抛错白屏——恢复是
  // loadTasks 之外唯一能把外部任务整批写入 store 的入口，必须在此补形状
  importTasks: (tasks, mode) => {
    const sanitized = sanitizeTaskEntries(tasks);
    if (mode === "replace") {
      set({ tasks: sanitized });
      get().persist();
      return sanitized.length;
    }
    const byId = new Map(get().tasks.map((t) => [t.id, t]));
    let added = 0;
    for (const t of sanitized) {
      if (!byId.has(t.id)) added++;
      byId.set(t.id, t);
    }
    const merged = Array.from(byId.values()).sort((a, b) => b.sortOrder - a.sortOrder);
    set({ tasks: merged });
    get().persist();
    return added;
  },
  importExcelTasks: (tasks, mode, options) => {
    const plan = planExcelImport(get().tasks, tasks, mode, options);
    if (plan.added > 0 || plan.updated > 0) {
      set({ tasks: plan.tasks });
      get().persist();
    }
    return plan;
  },
}));

export { emptyTask };

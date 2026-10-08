import type { Subtask, Task } from "./types";

export type ExcelImportMode = "merge" | "update";

export interface ExcelImportPlan {
  tasks: Task[];
  added: number;
  matched: number;
  updated: number;
  ambiguous: number;
}

const titleKey = (title: string) => title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const sameSecond = (a: string, b: string) => {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 1000;
};

function comparable(task: Task) {
  return {
    title: task.title,
    note: task.note,
    priority: task.priority,
    scheduledDate: task.scheduledDate,
    dueDate: task.dueDate,
    subtasks: task.subtasks.map(({ title, done }) => ({ title, done })),
    completedAt: task.completedAt ? Math.floor(Date.parse(task.completedAt) / 1000) : null,
  };
}

function findMatch(existing: Task[], incoming: Task, used: Set<string>): Task | "ambiguous" | null {
  const byId = existing.find((task) => task.id === incoming.id);
  if (byId) return used.has(byId.id) ? "ambiguous" : byId;

  const possible = existing.filter((task) =>
    titleKey(task.title) === titleKey(incoming.title) &&
    task.scheduledDate === incoming.scheduledDate,
  );
  const candidates = possible.filter((task) => !used.has(task.id));
  if (candidates.length === 0 && possible.length > 0) return "ambiguous";
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (sameSecond(candidate.createdAt, incoming.createdAt) ||
        JSON.stringify(comparable(candidate)) === JSON.stringify(comparable(incoming))) {
      return candidate;
    }
    return "ambiguous";
  }

  const byTime = candidates.filter((task) => sameSecond(task.createdAt, incoming.createdAt));
  if (byTime.length === 1) return byTime[0];
  const sameContent = (byTime.length > 0 ? byTime : candidates).filter((task) =>
    JSON.stringify(comparable(task)) === JSON.stringify(comparable(incoming)),
  );
  if (sameContent.length === 1) return sameContent[0];
  return "ambiguous";
}

function keepSubtaskIds(existing: Subtask[], incoming: Subtask[]): Subtask[] {
  return incoming.map((subtask, index) => ({
    ...subtask,
    id: existing[index]?.title === subtask.title ? existing[index].id : subtask.id,
  }));
}

/**
 * Excel 的“合并”只添加新任务；“更新匹配”覆盖匹配项并添加新项。
 * 其他任务永远保留。旧表无关联元数据时回退到标题+安排日，并在歧义时跳过。
 */
export function planExcelImport(existing: Task[], incoming: Task[], mode: ExcelImportMode): ExcelImportPlan {
  const next = [...existing];
  const used = new Set<string>();
  let added = 0;
  let matched = 0;
  let updated = 0;
  let ambiguous = 0;

  for (const task of incoming) {
    const found = findMatch(next, task, used);
    if (found === "ambiguous") {
      ambiguous++;
      continue;
    }
    if (!found) {
      next.push(task);
      used.add(task.id);
      added++;
      continue;
    }
    used.add(found.id);
    matched++;
    if (mode === "merge") continue;
    if (JSON.stringify(comparable(found)) === JSON.stringify(comparable(task))) continue;

    const replacement: Task = {
      ...task,
      id: found.id,
      createdAt: found.createdAt,
      sortOrder: found.sortOrder,
      completedAt: found.completedAt && task.completedAt && sameSecond(found.completedAt, task.completedAt)
        ? found.completedAt
        : task.completedAt,
      completedReason: task.completedAt ? found.completedReason ?? "manual" : null,
      subtasks: keepSubtaskIds(found.subtasks, task.subtasks),
    };
    const index = next.findIndex((item) => item.id === found.id);
    next[index] = replacement;
    updated++;
  }

  return { tasks: next, added, matched, updated, ambiguous };
}

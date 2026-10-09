import type { Todo, Task } from "./types";

export type ExcelImportMode = "merge" | "update";

// 导入数据是否携带「标签」/「分组」列（默认 true = 携带）：旧版导出文件没有这些列，
// 更新匹配时「列不存在」≠「列明确为空」——前者保留存量值，后者才会清空
export interface ExcelImportOptions {
  incomingHasTagsColumn?: boolean;
  incomingHasGroupColumn?: boolean;
}

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

// include*.flags = false 时对应字段不参与比较（文件缺该列，空值不构成「有变化」）
function comparable(task: Task, include: { tags: boolean; group: boolean }) {
  return {
    title: task.title,
    note: task.note,
    priority: task.priority,
    ...(include.tags ? { tags: task.tags } : {}),
    ...(include.group ? { group: task.group } : {}),
    scheduledDates: task.scheduledDates,
    todos: task.todos.map(({ title, done }) => ({ title, done })),
    completedAt: task.completedAt ? Math.floor(Date.parse(task.completedAt) / 1000) : null,
  };
}

function findMatch(
  existing: Task[],
  incoming: Task,
  used: Set<string>,
  include: { tags: boolean; group: boolean },
): Task | "ambiguous" | null {
  const byId = existing.find((task) => task.id === incoming.id);
  if (byId) return used.has(byId.id) ? "ambiguous" : byId;

  const possible = existing.filter((task) =>
    titleKey(task.title) === titleKey(incoming.title) &&
    task.scheduledDates.join('\n') === incoming.scheduledDates.join('\n'),
  );
  const candidates = possible.filter((task) => !used.has(task.id));
  if (candidates.length === 0 && possible.length > 0) return "ambiguous";
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (sameSecond(candidate.createdAt, incoming.createdAt) ||
        JSON.stringify(comparable(candidate, include)) === JSON.stringify(comparable(incoming, include))) {
      return candidate;
    }
    return "ambiguous";
  }

  const byTime = candidates.filter((task) => sameSecond(task.createdAt, incoming.createdAt));
  if (byTime.length === 1) return byTime[0];
  const sameContent = (byTime.length > 0 ? byTime : candidates).filter((task) =>
    JSON.stringify(comparable(task, include)) === JSON.stringify(comparable(incoming, include)),
  );
  if (sameContent.length === 1) return sameContent[0];
  return "ambiguous";
}

function keepTodoIds(existing: Todo[], incoming: Todo[]): Todo[] {
  return incoming.map((todo, index) => ({
    ...todo,
    id: existing[index]?.title === todo.title ? existing[index].id : todo.id,
  }));
}

/**
 * Excel 的“合并”只添加新任务；“更新匹配”覆盖匹配项并添加新项。
 * 其他任务永远保留。旧表无关联元数据时回退到标题+安排日，并在歧义时跳过。
 * incomingHas*Column = false（旧版导出缺该列）时：对应字段不参与变化比较，且保留匹配任务的存量值。
 */
export function planExcelImport(
  existing: Task[],
  incoming: Task[],
  mode: ExcelImportMode,
  options?: ExcelImportOptions,
): ExcelImportPlan {
  const include = {
    tags: options?.incomingHasTagsColumn !== false,
    group: options?.incomingHasGroupColumn !== false,
  };
  const next = [...existing];
  const used = new Set<string>();
  let added = 0;
  let matched = 0;
  let updated = 0;
  let ambiguous = 0;

  for (const task of incoming) {
    const found = findMatch(next, task, used, include);
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
    if (JSON.stringify(comparable(found, include)) === JSON.stringify(comparable(task, include))) continue;

    const replacement: Task = {
      ...task,
      id: found.id,
      createdAt: found.createdAt,
      sortOrder: found.sortOrder,
      // 文件缺列 = 「未提及」而非「清空」：沿用匹配任务的存量标签/分组
      tags: include.tags ? task.tags : found.tags,
      group: include.group ? task.group : found.group,
      completedAt: found.completedAt && task.completedAt && sameSecond(found.completedAt, task.completedAt)
        ? found.completedAt
        : task.completedAt,
      completedReason: task.completedAt ? found.completedReason ?? "manual" : null,
      todos: keepTodoIds(found.todos, task.todos),
    };
    const index = next.findIndex((item) => item.id === found.id);
    next[index] = replacement;
    updated++;
  }

  return { tasks: next, added, matched, updated, ambiguous };
}

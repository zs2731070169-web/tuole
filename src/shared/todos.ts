// 待办项纯逻辑：编辑抽屉的拖拽排序重排（2026-10-10 用户需求）。
// 无 React 依赖，tests/todos.test.ts 直接覆盖；数据契约本身零改动——
// Task.todos 的数组序即展示序（编辑抽屉 / 任务行 TodoPanel / Excel 往返同源），
// 重排只改数组内顺序，随「保存」整段落库。
import type { Todo } from "./types";

/**
 * 把 id 对应的待办项移动到 targetIndex。
 * targetIndex = 拖放时的几何插入位（与工作台栏内排序同口径：以**移除源项后**的数组计，
 * 首行上方 = 0、尾行下方 = rest.length）；越界钳制，未知 id 原样返回（幂等防御，
 * 绝不产出 undefined 槽位）。不突变入参数组。
 */
export function moveTodoItem(todos: Todo[], todoId: string, targetIndex: number): Todo[] {
  const fromIndex = todos.findIndex((item) => item.id === todoId);
  if (fromIndex < 0) return todos;
  const movedItem = todos[fromIndex];
  const rest = todos.filter((_, index) => index !== fromIndex);
  const clampedIndex = Math.max(0, Math.min(targetIndex, rest.length));
  rest.splice(clampedIndex, 0, movedItem);
  return rest;
}

/**
 * 待办项的展示勾选视图（2026-10-17 用户决策）：已完成任务的待办项**一律显示为已勾选**——
 * 任务既然结束，其待办项整体视为已完成。纯生命周期派生、零存储改动：真实勾选进度完整
 * 保留，重新打开任务即回到用户真实进度（派生可逆；不采用完成时回写 done 的方案——
 * 那会在重新打开后丢失原进度）。
 * 已勾选项保持原对象引用（免新建），未勾选项派生新对象、不突变入参；
 * 未完成任务原样返回同一数组引用。
 */
export function todosForDisplay(todos: Todo[], taskCompleted: boolean): Todo[] {
  if (!taskCompleted) return todos;
  return todos.map((todo) => (todo.done ? todo : { ...todo, done: true }));
}

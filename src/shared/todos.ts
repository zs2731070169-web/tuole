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

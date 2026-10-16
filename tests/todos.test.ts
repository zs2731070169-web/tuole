// 待办项纯函数：编辑抽屉拖拽排序的数组重排（2026-10-10）+
// 已完成任务的待办项展示勾选派生（2026-10-17）
import { describe, expect, it } from "vitest";
import { moveTodoItem, todosForDisplay } from "../src/shared/todos";
import { useTaskStore, emptyTask } from "../src/stores/useTaskStore";
import type { Todo } from "../src/shared/types";

const makeTodos = (ids: string[]): Todo[] => ids.map((id, i) => ({ id, title: `待办 ${id}`, done: i % 2 === 1 }));

describe("moveTodoItem", () => {
  it("下移一位（目标位按移除源项后的数组计）", () => {
    const result = moveTodoItem(makeTodos(["a", "b", "c"]), "a", 1);
    expect(result.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("上移到头部（首行上方 = 0）", () => {
    const result = moveTodoItem(makeTodos(["a", "b", "c"]), "c", 0);
    expect(result.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("移到尾部（尾行下方 = rest.length）", () => {
    const result = moveTodoItem(makeTodos(["a", "b", "c"]), "a", 2);
    expect(result.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("落回原位 = 顺序不变（与拖拽悬停自身区间等价的空放）", () => {
    const result = moveTodoItem(makeTodos(["a", "b", "c"]), "b", 1);
    expect(result.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("未知 id 原样返回（同一引用）", () => {
    const todos = makeTodos(["a", "b"]);
    expect(moveTodoItem(todos, "missing", 0)).toBe(todos);
  });

  it("越界钳制：负数到头部、超出长度到尾部", () => {
    expect(moveTodoItem(makeTodos(["a", "b", "c"]), "b", -5).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(moveTodoItem(makeTodos(["a", "b", "c"]), "a", 99).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("单项列表重排为无操作", () => {
    expect(moveTodoItem(makeTodos(["a"]), "a", 0).map((x) => x.id)).toEqual(["a"]);
  });

  it("不突变入参数组，条目字段（title/done）原样保留", () => {
    const todos = makeTodos(["a", "b", "c"]);
    const snapshot = todos.map((x) => ({ ...x }));
    const result = moveTodoItem(todos, "a", 2);
    expect(todos).toEqual(snapshot); // 原数组顺序与内容不变
    expect(result.find((x) => x.id === "a")).toEqual({ id: "a", title: "待办 a", done: false });
    expect(result.find((x) => x.id === "b")).toEqual({ id: "b", title: "待办 b", done: true });
  });
});

describe("todosForDisplay 已完成任务的待办项展示勾选（2026-10-17 用户决策）", () => {
  it("已完成：全部显示为已勾选；已勾项保持原引用、入参不被突变", () => {
    const checked = { id: "a", title: "已勾", done: true };
    const unchecked = { id: "b", title: "未勾", done: false };
    const out = todosForDisplay([checked, unchecked], true);
    expect(out.map((item) => item.done)).toEqual([true, true]);
    expect(out[0]).toBe(checked); // 已勾选不新建对象
    expect(out[1]).not.toBe(unchecked); // 未勾选派生新对象（展示视图，不碰存储）
    expect(unchecked.done).toBe(false); // 入参未突变
  });

  it("未完成：原样返回同一数组引用（免拷贝）", () => {
    const todos = makeTodos(["a", "b"]);
    expect(todosForDisplay(todos, false)).toBe(todos);
  });

  it("空列表照常返回空数组", () => {
    expect(todosForDisplay([], true)).toEqual([]);
  });
});

describe("toggleTodo 已完成任务勾选锁定（store 防御，2026-10-17）", () => {
  it("已完成任务的待办项不可改勾：真无操作（引用不变，真实进度保留）", () => {
    const done = emptyTask({
      id: "done-task",
      title: "已完成的任务",
      scheduledDates: ["2026-10-14"],
      startedAt: "2026-10-14T08:00:00.000Z",
      completedAt: "2026-10-14T09:00:00.000Z",
      todos: [
        { id: "t1", title: "已勾", done: true },
        { id: "t2", title: "未勾", done: false },
      ],
    });
    useTaskStore.setState({ tasks: [done] });
    const before = useTaskStore.getState().tasks[0];

    useTaskStore.getState().toggleTodo("done-task", "t2");

    // 引用不变 = 未 set：真实勾选进度原样保留，重新打开任务后照常展示
    expect(useTaskStore.getState().tasks[0]).toBe(before);
    expect(useTaskStore.getState().tasks[0].todos[1]).toMatchObject({ id: "t2", done: false });
  });

  it("未完成任务照常翻转勾选", () => {
    const active = emptyTask({
      id: "active-task",
      title: "进行中任务",
      scheduledDates: ["2026-10-14"],
      startedAt: "2026-10-14T08:00:00.000Z",
      todos: [{ id: "t1", title: "待勾", done: false }],
    });
    useTaskStore.setState({ tasks: [active] });

    useTaskStore.getState().toggleTodo("active-task", "t1");

    expect(useTaskStore.getState().tasks[0].todos[0]).toMatchObject({ id: "t1", done: true });
  });
});

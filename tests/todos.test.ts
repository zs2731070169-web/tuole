// 待办项纯函数：编辑抽屉拖拽排序的数组重排（2026-10-10）
import { describe, expect, it } from "vitest";
import { moveTodoItem } from "../src/shared/todos";
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

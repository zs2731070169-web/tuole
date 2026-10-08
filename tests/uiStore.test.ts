// useUiStore 选中通道语义：单击切换/再点取消（2026-10 用户决策：选中态必须有退出路径，
// 否则工作台蓝色高亮会一直卡住）、修饰键多选同步勾选集合、勾选与高亮两通道分离；
// 初始视图决策：应用启动（新会话）默认落在「概览」，同会话刷新停留在当前视图
import { beforeEach, describe, expect, it } from "vitest";
import { resolveInitialView, useUiStore } from "../src/stores/useUiStore";

describe("resolveInitialView（启动落点 / 刷新停留）", () => {
  it("新会话（应用启动，无会话标记）→ 默认「概览」，即使持久化了其他视图", () => {
    expect(resolveInitialView(false, "calendar")).toBe("all");
    expect(resolveInitialView(false, "workbench")).toBe("all");
  });

  it("同会话刷新（会话标记存在）→ 沿用持久化的上次视图", () => {
    expect(resolveInitialView(true, "calendar")).toBe("calendar");
    expect(resolveInitialView(true, "workbench")).toBe("workbench");
  });

  it("sessionStorage 不可用（无法判定会话）→ 回落持久化语义（旧行为）", () => {
    expect(resolveInitialView(true, "all")).toBe("all");
  });
});

describe("select（选中高亮通道）", () => {
  beforeEach(() => {
    useUiStore.setState({ selectedIds: [], checkedIds: [] });
  });

  it("单击未选中卡 → 成为唯一选中", () => {
    useUiStore.getState().select("a", false);
    expect(useUiStore.getState().selectedIds).toEqual(["a"]);
  });

  it("再次单击唯一选中的卡 → 取消选中（退出路径，勿改回永远 set([id])）", () => {
    useUiStore.getState().select("a", false);
    useUiStore.getState().select("a", false);
    expect(useUiStore.getState().selectedIds).toEqual([]);
  });

  it("单击另一张卡 → 切换选中（替换而非叠加）", () => {
    useUiStore.getState().select("a", false);
    useUiStore.getState().select("b", false);
    expect(useUiStore.getState().selectedIds).toEqual(["b"]);
  });

  it("修饰键多选：选中与勾选同步进出；取消后单击仍可重新选中", () => {
    useUiStore.getState().select("a", true);
    expect(useUiStore.getState()).toMatchObject({ selectedIds: ["a"], checkedIds: ["a"] });
    useUiStore.getState().select("a", true); // 再按修饰键点 = 同时移出两个集合
    expect(useUiStore.getState()).toMatchObject({ selectedIds: [], checkedIds: [] });
    useUiStore.getState().select("a", false);
    expect(useUiStore.getState().selectedIds).toEqual(["a"]);
  });

  it("单选不动勾选集合（两通道分离）；toggleChecked 勾选顺带高亮、取消勾选一并撤下", () => {
    useUiStore.getState().select("a", false);
    expect(useUiStore.getState().checkedIds).toEqual([]);
    useUiStore.getState().toggleChecked("b");
    expect(useUiStore.getState()).toMatchObject({ checkedIds: ["b"], selectedIds: ["a", "b"] });
    useUiStore.getState().toggleChecked("b");
    expect(useUiStore.getState()).toMatchObject({ checkedIds: [], selectedIds: ["a"] });
  });

  it("clearHighlight（点空白处）只撤高亮、不动批量勾选集合", () => {
    useUiStore.getState().toggleChecked("a"); // 勾选顺带高亮
    useUiStore.getState().select("b", false);
    useUiStore.getState().clearHighlight();
    expect(useUiStore.getState()).toMatchObject({ selectedIds: [], checkedIds: ["a"] });
  });
});

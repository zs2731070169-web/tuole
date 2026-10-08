// 日历删除模式选日语义 = Finder 选区模型（2026-10 用户决策：旧「toggle 累加 + 连选后锚点漂移」
// 不顺手已废弃——系统原生连选的锚点是固定的、范围可反复调整）：
// 普通点击 = 只选这一天（重置为单日）并把锚点移到该日；
// Shift+点击 = 选中恰好「锚点→该日」闭区间（整体替换），锚点保持不动，可反复收窄/放宽；
// ⌘/Ctrl+点击 = 单日勾选/取消（散点加减，不破坏其余选中），锚点随之移动。
import { beforeEach, describe, expect, it } from "vitest";
import { useCalendarStore } from "../src/stores/useCalendarStore";

function resetDeleteState() {
  useCalendarStore.setState({
    deleteMode: true,
    deleteDays: [],
    deleteAnchorDay: null,
  });
}

describe("按日期删除 · Finder 选区模型", () => {
  beforeEach(resetDeleteState);

  it("普通点击 = 只选这一天（整体重置为单日）并把锚点移到该日", () => {
    useCalendarStore.getState().rangeSelectDeleteDay("2026-10-08"); // 先有 08..08
    useCalendarStore.getState().selectDeleteDay("2026-10-12"); // 点另一天 → 只剩这一天
    const state = useCalendarStore.getState();
    expect(state.deleteDays).toEqual(["2026-10-12"]);
    expect(state.deleteAnchorDay).toBe("2026-10-12");
  });

  it("Shift+点击 = 锚点→该日的闭区间（整体替换，段外自动取消）", () => {
    useCalendarStore.getState().toggleDeleteDay("2026-10-20"); // 散点勾一天（段外）
    useCalendarStore.getState().selectDeleteDay("2026-10-08"); // 锚点 08
    useCalendarStore.getState().rangeSelectDeleteDay("2026-10-11");
    expect(useCalendarStore.getState().deleteDays).toEqual([
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]); // 10-20 被整段替换掉
  });

  it("连选后锚点保持不动：可继续 Shift 到其他日反复收窄/放宽范围（Finder 手感的核心）", () => {
    useCalendarStore.getState().selectDeleteDay("2026-10-08"); // 锚点 08
    useCalendarStore.getState().rangeSelectDeleteDay("2026-10-12"); // 放宽到 08..12
    expect(useCalendarStore.getState().deleteDays).toHaveLength(5);
    useCalendarStore.getState().rangeSelectDeleteDay("2026-10-10"); // 收窄回 08..10
    const state = useCalendarStore.getState();
    expect(state.deleteDays).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
    expect(state.deleteAnchorDay).toBe("2026-10-08"); // 锚点始终未动
  });

  it("Shift 点击早于锚点的日期：区间自动归一（逆序同样成立）", () => {
    useCalendarStore.getState().selectDeleteDay("2026-10-10");
    useCalendarStore.getState().rangeSelectDeleteDay("2026-10-08");
    expect(useCalendarStore.getState().deleteDays).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
  });

  it("无锚点时首次即 Shift 点击：退化为单日并就地建立锚点", () => {
    useCalendarStore.getState().rangeSelectDeleteDay("2026-10-08");
    const state = useCalendarStore.getState();
    expect(state.deleteDays).toEqual(["2026-10-08"]);
    expect(state.deleteAnchorDay).toBe("2026-10-08");
  });

  it("⌘/Ctrl+点击 = 单日勾选/取消（不破坏其余选中），锚点随之移动（后续 Shift 连选从新锚点起算）", () => {
    useCalendarStore.getState().selectDeleteDay("2026-10-08"); // 锚点 08
    useCalendarStore.getState().toggleDeleteDay("2026-10-15"); // ⌘ 勾 15
    expect(useCalendarStore.getState().deleteDays).toEqual(["2026-10-08", "2026-10-15"]);
    useCalendarStore.getState().toggleDeleteDay("2026-10-08"); // ⌘ 取消 08
    expect(useCalendarStore.getState().deleteDays).toEqual(["2026-10-15"]);
    expect(useCalendarStore.getState().deleteAnchorDay).toBe("2026-10-08"); // 锚点随最近一次 ⌘ 点击
    useCalendarStore.getState().rangeSelectDeleteDay("2026-10-17"); // 从新锚点 08 连到 17
    expect(useCalendarStore.getState().deleteDays).toHaveLength(10); // 08..17 整段替换
  });

  it("⌘⇧+点击 = 锚点→该日闭区间**并入**现有选中（不连续多段一次拼完，锚点不动）", () => {
    useCalendarStore.getState().selectDeleteDay("2026-10-05"); // 锚点 05
    useCalendarStore.getState().rangeSelectDeleteDay("2026-10-07"); // 第一段 05..07
    useCalendarStore.getState().toggleDeleteDay("2026-10-20"); // ⌘ 点 20，锚点随移
    // ⌘⇧ 从新锚点 20 并入到 22：两段并存、互不替换
    useCalendarStore.getState().addDeleteDayRangeFromAnchor("2026-10-22");
    const state = useCalendarStore.getState();
    expect(state.deleteDays).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(state.deleteAnchorDay).toBe("2026-10-20"); // 并入不动锚点
  });

  it("进入/取消删除模式复位选中与锚点", () => {
    useCalendarStore.getState().selectDeleteDay("2026-10-08");
    useCalendarStore.getState().rangeSelectDeleteDay("2026-10-10");
    useCalendarStore.getState().cancelDeleteMode();
    expect(useCalendarStore.getState()).toMatchObject({
      deleteMode: false,
      deleteDays: [],
      deleteAnchorDay: null,
      });
  });
});

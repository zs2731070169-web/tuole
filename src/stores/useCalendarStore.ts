// 日历 store：月/周视图模式与锚点日期。
// 放在 store 而非组件局部：状态筛选栏的计数按「当前展示月」统计，需要读到同一锚点。
// 月份导航主要由日历网格上下跟手拖拽完成；工具行保留一个「回到本月」快捷入口；
// 现行导航 = 日历网格上下跟手拖拽（见 CalendarView 的 gridRef/dragNav，松手过阈值翻页、否则弹回）
import { create } from "zustand";
import { startOfMonth } from "date-fns";
import { todayKey, dayKeysInRange } from "../lib/date";

interface CalendarState {
  anchor: Date; // 当前展示的参考日期（该月任意一天，统一存月初）；仅月视图
  selectedDay: string | null; // 选中的日期格（YYYY-MM-DD）；放 store：ViewToolbar 的新建按钮要读它决定排期目标
  deleteMode: boolean; // 按日期删除模式；开启后格子点击改为多选日期，不再触发跳转
  deleteDays: string[]; // 待删除任务所在日期，可跨月累积选择
  deleteAnchorDay: string | null; // 连选锚点（Finder 语义）：普通点击/⌘ 点击会移动锚点，Shift 连选**不动**锚点——范围可反复调整
  setAnchor: (d: Date) => void;
  goToCurrentMonth: () => void;
  setSelectedDay: (k: string | null) => void;
  startDeleteMode: () => void;
  selectDeleteDay: (k: string) => void; // 普通点击：只选这一天（重置为单日）并把锚点移到该日
  rangeSelectDeleteDay: (targetKey: string) => void; // Shift+点击：选中 = 恰好「锚点→该日」闭区间，锚点保持不动
  addDeleteDayRangeFromAnchor: (targetKey: string) => void; // ⌘/Ctrl+Shift+点击：锚点→该日闭区间**并入**现有选中（不连续多段选择）
  toggleDeleteDay: (k: string) => void; // ⌘/Ctrl+点击：单日勾选/取消（散点加减），锚点随之移到该日
  cancelDeleteMode: () => void;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  anchor: startOfMonth(new Date()),
  selectedDay: null,
  deleteMode: false,
  deleteDays: [],
  deleteAnchorDay: null,
  setAnchor: (d) => set({ anchor: d }),
  goToCurrentMonth: () => {
    const now = new Date();
    set({ anchor: startOfMonth(now), selectedDay: todayKey(now) });
  },
  setSelectedDay: (k) => set({ selectedDay: k }),
  startDeleteMode: () =>
    set({
      deleteMode: true,
      deleteDays: [],
      deleteAnchorDay: null,
    }),
  // 普通点击（Finder 语义）：只选这一天（整个选中重置为该单日）并把锚点移到该日。
  // 旧「单击 = toggle 累加」语义已废弃（2026-10 用户反馈不顺手：与连选替换语义混用难以预测）
  selectDeleteDay: (k) => set({ deleteDays: [k], deleteAnchorDay: k }),
  // Shift+点击连选（Finder 语义）：选中 = 恰好「锚点 → 该日」的闭区间（整体替换——
  // 只有这段被选，段外自动取消）；**锚点保持不动**，可继续 Shift 点其他日反复收窄/放宽范围。
  // 无锚点（进入模式后首次即 Shift 点击）退化为单日并就地建立锚点
  rangeSelectDeleteDay: (targetKey) =>
    set((state) => {
      const anchorKey = state.deleteAnchorDay ?? targetKey;
      return { deleteDays: dayKeysInRange(anchorKey, targetKey), deleteAnchorDay: anchorKey };
    }),
  // ⌘/Ctrl+Shift+点击（Finder 同款组合键）：把「锚点→该日」闭区间**并入**现有选中——
  // 不替换、不动锚点，「第一周 + 第三周」这类不连续多段一次手势拼完；无锚点退化为并入单日并建立锚点
  addDeleteDayRangeFromAnchor: (targetKey) =>
    set((state) => {
      const anchorKey = state.deleteAnchorDay ?? targetKey;
      const merged = new Set(state.deleteDays);
      for (const dayKey of dayKeysInRange(anchorKey, targetKey)) merged.add(dayKey);
      return { deleteDays: [...merged], deleteAnchorDay: anchorKey };
    }),
  // ⌘/Ctrl+点击（Finder 语义）：单日勾选/取消——散点加减不破坏其余选中；锚点随移动到该日
  //（与 Finder 一致：⌘ 点击的对象成为后续 Shift 连选的新锚点）
  toggleDeleteDay: (k) =>
    set((state) => ({
      deleteDays: state.deleteDays.includes(k)
        ? state.deleteDays.filter((day) => day !== k)
        : [...state.deleteDays, k],
      deleteAnchorDay: k,
    })),
  cancelDeleteMode: () =>
    set({
      deleteMode: false,
      deleteDays: [],
      deleteAnchorDay: null,
    }),
}));

// 筛选 store：只读查看视角（状态/优先级/日期/关键词）
// 红线：这里的一切都只影响展示，绝不触碰任何任务状态
import { create } from "zustand";
import type { FilterState, StatusFilterKey, Priority } from "../shared/types";
import { EMPTY_FILTER } from "../shared/filter";

interface FilterStoreState {
  filter: FilterState;
  setStatus: (s: StatusFilterKey) => void;
  togglePriority: (p: Priority) => void;
  /** 选中「全部」：清空具体优先级筛选（priorities 为空 = 不过滤，UI 上「全部」点亮） */
  clearPriorities: () => void;
  setDateRange: (from: string | null, to: string | null) => void;
  setKeyword: (k: string) => void;
  clearAll: () => void;
}

export const useFilterStore = create<FilterStoreState>((set, get) => ({
  filter: { ...EMPTY_FILTER },
  setStatus: (s) => set({ filter: { ...get().filter, status: s } }),
  togglePriority: (p) => {
    // 「全部」按钮不走这里（走 clearPriorities）；取消到最后一个具体优先级时
    // priorities 归空 = 回落「全部」选中，保证任何时刻至少有一个选项点亮
    if (p === "none") return;
    const cur = get().filter.priorities;
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    set({ filter: { ...get().filter, priorities: next } });
  },
  clearPriorities: () => set({ filter: { ...get().filter, priorities: [] } }),
  setDateRange: (from, to) => set({ filter: { ...get().filter, dateFrom: from, dateTo: to } }),
  setKeyword: (k) => set({ filter: { ...get().filter, keyword: k } }),
  clearAll: () => set({ filter: { ...EMPTY_FILTER } }),
}));

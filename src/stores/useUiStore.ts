// UI store：视图模式、选中任务、编辑面板、设置抽屉等纯界面态
import { create } from "zustand";
import type { ViewMode, TaskStatus } from "../shared/types";
import { loadUiState, saveUiState } from "../lib/storage";
import { todayKey } from "../lib/date";
import { useTaskStore } from "../stores/useTaskStore";

// 「启动 vs 刷新」会话标记：sessionStorage 跨刷新（F5/⌘R）保留、随应用/标签页关闭清空，
// 浏览器与 Electron 行为一致——模块加载时无标记即视为新会话（应用本次启动）
const SESSION_LAUNCH_FLAG = "todo.session.v1";

/** 初始视图决策（纯函数，单测锚点）：新会话启动默认落在「概览」（2026-10 用户决策）；
 *  同会话内的刷新沿用持久化的上次视图（既有「刷新后停留在当前视图」决策保留） */
export function resolveInitialView(sessionActive: boolean, persistedView: ViewMode): ViewMode {
  return sessionActive ? persistedView : "all";
}

// 模块加载期一次性判定初始视图，并即刻标记会话已激活（后续刷新走「沿用上次视图」分支）。
// sessionStorage 不可用（隐私模式等）时无法区分启动/刷新，回落旧的持久化语义（sessionActive 恒 true）
function decideInitialView(): ViewMode {
  let sessionActive = true;
  try {
    sessionActive = sessionStorage.getItem(SESSION_LAUNCH_FLAG) === "1";
    sessionStorage.setItem(SESSION_LAUNCH_FLAG, "1");
  } catch {
    /* 保持 true：无法判定会话时维持旧的「恢复上次视图」行为 */
  }
  return resolveInitialView(sessionActive, loadUiState().view);
}

const initialView = decideInitialView();

interface UiState {
  view: ViewMode;
  returnView: ViewMode | null; // 跨视图跳转（日历点任务 chip → 工作台）后的可返回视图；任何手动切视图即清空
  workbenchDay: string; // 工作台「当日」栏锚点（YYYY-MM-DD），默认今天、不持久化；状态筛选栏按它统计当日任务
  selectedIds: string[]; // 选中（高亮）任务：单击卡片进入，是单击高亮的目标集合
  checkedIds: string[]; // 打勾（批量勾选框）任务：批量操作条的目标。与选中分离——单击选中不自动打勾
  editingId: string | null; // 打开的任务详情/编辑面板
  expandedIds: string[]; // 展开「待办项面板」的任务（勾选在行内进行，不进编辑抽屉；2026-10 由「子任务」更名）
  settingsOpen: boolean;
  newTaskOpen: boolean;
  draggingStatus: TaskStatus | null; // 拖拽中任务的派生状态（dragover 阶段读不到 dataTransfer，已完成栏据此拒绝不可结束的任务）
  draggingTaskId: string | null; // 拖拽中的任务 id：dragover 阶段判「同栏内排序放置」用（dataTransfer 同样读不到）
  setView: (v: ViewMode) => void;
  openDayInWorkbench: (dayKey: string) => void; // 日历 chip 点击：锚定该日跳工作台查看，并记录可返回日历
  goBackToReturnView: () => void; // 工作台「返回日历」等回退入口，用完即清空返回态
  setWorkbenchDay: (day: string) => void;
  select: (id: string, additive?: boolean) => void;
  clearSelection: () => void;
  clearHighlight: () => void; // 点空白处只撤选中高亮，不动批量勾选集合（勾选是独立通道）
  toggleChecked: (id: string) => void; // 批量勾选框：打勾同时保持高亮；取消勾则同时取消高亮
  openEditor: (id: string) => void;
  closeEditor: () => void;
  toggleExpanded: (id: string) => void;
  collapseAll: () => void;
  setSettingsOpen: (b: boolean) => void;
  setNewTaskOpen: (b: boolean) => void;
  setDraggingStatus: (s: TaskStatus | null) => void;
  setDraggingTaskId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  // 初始视图（模块加载期定格）：应用启动（新会话）默认「概览」；同会话刷新停留在当前视图
  view: initialView,
  returnView: null,
  workbenchDay: todayKey(),
  selectedIds: [],
  checkedIds: [],
  editingId: null,
  expandedIds: [],
  settingsOpen: false,
  newTaskOpen: false,
  draggingStatus: null,
  draggingTaskId: null,
  setWorkbenchDay: (day) => set({ workbenchDay: day }),
  // 手动切视图（TopBar）一律清空返回态——用户自己导航后「返回」按钮即失效
  setView: (v) => {
    set({ view: v, returnView: null });
    saveUiState({ view: v });
  },
  // 日历点任务 chip 的跳转入口：工作台锚定到该任务所在日（活动任务=安排日，已结束=完成日），
  // returnView 记录来源，工作台顶部条据此显示「返回日历」
  openDayInWorkbench: (dayKey) => {
    set({ view: "workbench", workbenchDay: dayKey, returnView: "calendar" });
    saveUiState({ view: "workbench" });
  },
  goBackToReturnView: () => {
    const target = get().returnView;
    if (!target) return;
    set({ view: target, returnView: null });
    saveUiState({ view: target });
  },
  select: (id, additive) => {
    const cur = get().selectedIds;
    if (additive) {
      // 修饰键多选 = 批量语义：选中与打勾同步进出（勾选框视觉随之点亮）
      const nextSelected = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      const checked = get().checkedIds;
      const nextChecked = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
      set({ selectedIds: nextSelected, checkedIds: nextChecked });
    } else {
      // 单选只改高亮，**不**自动打勾、不弹编辑抽屉、不动已勾选的批量集合。
      // 再次单击「唯一选中」的那张卡 = 取消选中（2026-10 用户决策：选中态必须有退出路径，
      // 否则工作台无任何清除入口，蓝色高亮会一直卡住）；点其他卡 = 切换选中
      if (cur.length === 1 && cur[0] === id) {
        set({ selectedIds: [] });
      } else {
        set({ selectedIds: [id] });
      }
    }
  },
  clearSelection: () => set({ selectedIds: [], checkedIds: [] }),
  clearHighlight: () => set({ selectedIds: [] }),
  toggleChecked: (id) => {
    const checked = get().checkedIds;
    const selected = get().selectedIds;
    if (checked.includes(id)) {
      // 取消勾：勾选与高亮一并撤下
      set({ checkedIds: checked.filter((x) => x !== id), selectedIds: selected.filter((x) => x !== id) });
    } else {
      set({ checkedIds: [...checked, id], selectedIds: selected.includes(id) ? selected : [...selected, id] });
    }
  },
  openEditor: (id) => {
    // 切换编辑对象时，先按 closeEditor 同一口径回收上一个空壳草稿：
    // 避免「A 处弹窗没填标题 → 直接开 B」留下统计计入但列表不可见的幽灵任务
    const prevId = get().editingId;
    if (prevId && prevId !== id) {
      const discarded = useTaskStore.getState().discardEmptyDraft(prevId);
      if (discarded) {
        console.log("[妥了] discardEmptyDraft: 已回收空标题任务", prevId);
      }
    }
    set({ editingId: id, selectedIds: [id] });
  },
  // 待办项面板展开态：可同时展开多条，纯界面态不入库（2026-10 由「子任务」更名）
  toggleExpanded: (id) => {
    const cur = get().expandedIds;
    set({ expandedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  },
  collapseAll: () => set({ expandedIds: [] }),
  // 关闭抽屉的唯一出口：顺带回收「空壳草稿」（新建后没填标题就关掉的任务）
  closeEditor: () => {
    const id = get().editingId;
    set({ editingId: null });
    if (!id) return;
    const discarded = useTaskStore.getState().discardEmptyDraft(id);
    if (discarded) {
      console.log("[妥了] discardEmptyDraft: 已回收空标题任务", id);
      set((s) => ({ selectedIds: s.selectedIds.filter((x) => x !== id) }));
    }
  },
  setSettingsOpen: (b) => set({ settingsOpen: b }),
  setNewTaskOpen: (b) => set({ newTaskOpen: b }),
  setDraggingStatus: (s) => set({ draggingStatus: s }),
  setDraggingTaskId: (id) => set({ draggingTaskId: id }),
}));

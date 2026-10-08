// 全局共享类型：任务、状态机、筛选、设置等契约定义
// status 字段由系统写入，前端只读 —— 无任何手动改状态的入口类型

export type TaskStatus =
  | "unscheduled" // 未安排：已创建、无安排日期
  | "upcoming" // 即将到来：执行期尚未开始
  | "today" // 当前执行中：今天位于执行期内
  | "overdue" // 逾期：过了执行期结束日仍未处理（保留在视野内）
  | "done"; // 已完成：已结束

export type CompletedReason = "manual" | "dragged" | null;

export type Priority = "high" | "medium" | "low" | "none";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  note: string;
  priority: Priority;
  scheduledDate: string | null; // 执行期起始日 'YYYY-MM-DD'，null 表示未安排
  dueDate: string | null; // 可选执行期结束日（含当天）；null 表示单日任务
  subtasks: Subtask[];
  createdAt: string; // ISO
  // 最近一次用户侧创建/编辑落库时刻（ISO，可选兼容历史数据）：当天提醒时刻之后改动的任务
  // 当天不进到期提醒（保存反馈由顶部 toast 承担，紧随的提醒弹窗构成双弹打扰）——见 reminder.cjs
  updatedAt?: string;
  completedAt: string | null; // ISO
  completedReason: CompletedReason;
  sortOrder: number; // 自定义拖拽排序权重
  draft?: boolean; // 新建草稿标记：true = 尚未点「保存」，被 views 派生排除（任何列表/日历格/计数不渲染）；保存时清除，关闭抽屉/启动清理时整条回收
  parkedDate?: string | null; // 未安排任务的「停靠日」：未安排与进行中一样跟着日期走、按日隔离（选中哪天就看哪天的未安排栏/日历格）；一旦安排（scheduledDate 落值）即清空、由 scheduledDate 接管
  manualStatus?: never; // 红线：禁止手动状态字段存在
}

// 计算后的视图状态：status 永远由 computeAutoStatus 派生，不入库
export interface TaskView extends Task {
  status: TaskStatus;
}

// 只读筛选维度（查看视角，不影响任何状态流转）
// 注：「今天」不作为筛选维度 —— 它是时间位置，与生命周期状态不同维度；含在「进行中」内
export type StatusFilterKey =
  | "all"
  | "active" // 进行中 = upcoming + today（未安排独立成维，2026-10 用户决策）
  | "overdue"
  | "unscheduled" // 未安排 = scheduledDate 为空的活动任务
  | "done";

export interface FilterState {
  status: StatusFilterKey;
  priorities: Priority[];
  dateFrom: string | null; // 'YYYY-MM-DD'
  dateTo: string | null;
  keyword: string;
}

// 工作台（未安排/今日/已完成三栏）取代旧的时间轴流水视图
// 运行时清单是唯一真相源：类型由它派生，storage 的持久化校验也用它，新增视图不会两处漂移
export const VIEW_MODES = ["workbench", "calendar", "all"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export type ThemeMode = "system" | "light" | "dark";
export type RollOverTarget = "tomorrow" | "nextWeekday";

export interface Settings {
  theme: ThemeMode;
  language: "zh-CN" | "en-US";
  rollOverTarget: RollOverTarget; // 顺延默认目标
  reminderEnabled: boolean;
  reminderTime: string; // 到期提醒时间 "HH:MM"（24 小时制），默认 "09:00"
  autoBackupEnabled: boolean; // 自动备份开关（应用内滚动快照），默认关
  autoBackupIntervalMinutes: number; // 自动备份最小间隔（分钟），默认 30
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "zh-CN",
  rollOverTarget: "tomorrow",
  reminderEnabled: false,
  reminderTime: "09:00",
  autoBackupEnabled: false,
  autoBackupIntervalMinutes: 30,
};

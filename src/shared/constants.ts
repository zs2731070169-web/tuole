// 全局常量：存储键、筛选项定义、快捷键映射、状态机默认规则
import type { StatusFilterKey, Priority } from "./types";

export const STORAGE_KEYS = {
  tasks: "todo.tasks.v1",
  settings: "todo.settings.v1",
  ui: "todo.ui.v1",
  backups: "todo.backups.v1",
} as const;

// 只读状态筛选器分段项（查看视角，不改变任何任务状态）
// 「今天」不在其中：它是时间位置而非生命周期状态，已并入「进行中」
export const STATUS_FILTER_OPTIONS: { key: StatusFilterKey; labelZh: string; labelEn: string }[] = [
  { key: "all", labelZh: "全部", labelEn: "All" },
  { key: "active", labelZh: "进行中", labelEn: "Active" },
  { key: "overdue", labelZh: "逾期", labelEn: "Overdue" },
  { key: "unscheduled", labelZh: "未安排", labelEn: "Unscheduled" },
  { key: "done", labelZh: "已完成", labelEn: "Done" },
];

export const PRIORITY_OPTIONS: { value: Priority; labelZh: string; labelEn: string }[] = [
  { value: "high", labelZh: "高", labelEn: "High" },
  { value: "medium", labelZh: "中", labelEn: "Medium" },
  { value: "low", labelZh: "低", labelEn: "Low" },
  { value: "none", labelZh: "无", labelEn: "None" },
];

export const APP_NAME = "妥了 · ToDone";

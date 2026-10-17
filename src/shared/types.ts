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

export interface Todo {
  id: string;
  title: string;
  done: boolean;
}

/** 待办项数组归一：非数组 → []；剔除无字符串标题的坏条目。
 *  旧键折转（2026-10-09 正名迁移）由 storage.ts 的迁移单点处理后传入 */
export function normalizeTodoItems(value: unknown): Todo[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Todo => !!item && typeof item === "object" && typeof (item as Todo).title === "string",
  );
}

export interface Task {
  id: string;
  title: string;
  note: string;
  priority: Priority;
  tags: string[]; // 标签（2026-10 新增）：自由多值标注、纯展示性元数据，不参与状态机/筛选/搜索/统计口径
  group: string | null; // 分组（2026-10-09 新增）：单值互斥归类——日历同组同色成块识别；null = 无分组不着色
  scheduledDates: string[]; // 任务所属日期：排序去重、可分散；日期与生命周期状态独立
  // 「安排」动作的持久化标记。null = 未安排；有值 = 已开始，再结合日期派生 upcoming/today/overdue。
  // undefined 只用于兼容迁移前数据（有日期视为已开始）；storage 载入后会收敛为显式值。
  startedAt?: string | null;
  todos: Todo[];
  createdAt: string; // ISO
  // 最近一次用户侧创建/编辑落库时刻（ISO，可选兼容历史数据）：编辑审计戳；
  // 亦被 storage 的 startedAt 迁移回填与 taskElapsed 的迁移伪影防御引用
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

// 备忘（2026-10-18 新增第 4 视图）：记录「未来某一天可能会安排、现在还不确定」的任务暂存池。
// 独立实体、独立存储，不参与任务的状态机/筛选/统计/Excel/备份/提醒任何链路；
// 可经「转为任务」打开缓冲侧边栏，显式选定单日并确认后转成正式任务、从池中移除。
export interface NoteItem {
  id: string;
  title: string; // 必填：保存时校验非空
  note: string; // 备注（选填）
  createdAt: string; // ISO
  updatedAt?: string; // 最近一次编辑落库时刻
}

// 消息中心（2026-10-18 提醒重构）：每日首启摘要取代固定时间提醒，弹窗/音效投递整体下线。
// 独立实体、独立存储（todo.messages.v1 / ~/.tuole/messages.json），不参与任务任何链路；
// 每天至多一条 dailyDigest，id = `digest-{dayKey}`（dayKey 兼作当日去重键）。

/** 摘要内任务引用：taskId 供整行点击跳转与实时状态同步；title 只作任务删除后的快照兜底。 */
export interface DigestTaskRef {
  taskId: string;
  title: string;
}

export interface DailyDigestPayload {
  todayCount: number; // 生成时刻快照；渲染时按 tasks × 当前任务库实时重算
  overdueCount: number; // 生成时刻快照；渲染时按 tasks × 当前任务库实时重算
  tasks: DigestTaskRef[]; // 生成时的全部任务引用（today 在前 overdue 在后）；展示层自行截断
  hiddenCount: number; // 旧版截断载荷的兼容差额；新版固定 0
}

export interface AppMessage {
  id: string; // `digest-{dayKey}`
  kind: "dailyDigest"; // 判别联合预留：v1 只有每日摘要一种消息
  dayKey: string; // 消息所属日 YYYY-MM-DD（本地日键）
  createdAt: string; // 生成时刻 ISO
  readAt: string | null; // 已读时刻 ISO；null = 未读（红点判定依据）
  digest: DailyDigestPayload;
}

// 工作台（未安排/今日/已完成三栏）取代旧的时间轴流水视图
// 运行时清单是唯一真相源：类型由它派生，storage 的持久化校验也用它，新增视图不会两处漂移
export const VIEW_MODES = ["workbench", "calendar", "all", "notes"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export type ThemeMode = "system" | "light" | "dark";
export type RollOverTarget = "tomorrow" | "nextWeekday";

export interface Settings {
  theme: ThemeMode;
  language: "zh-CN" | "en-US";
  rollOverTarget: RollOverTarget; // 顺延默认目标
  reminderEnabled: boolean; // 每日摘要开关：开启后每天首次启动生成当日消息（消息中心查看）
  autoBackupEnabled: boolean; // 自动备份开关（应用内滚动快照），默认关
  autoBackupIntervalMinutes: number; // 自动备份最小间隔（分钟），默认 30
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "zh-CN",
  rollOverTarget: "tomorrow",
  reminderEnabled: false,
  autoBackupEnabled: false,
  autoBackupIntervalMinutes: 30,
};

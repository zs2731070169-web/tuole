// 本地持久化（完全离线、数据不出本机）：
// - 浏览器版：localStorage；
// - 桌面版（Electron）：用户目录 ~/.tuole 下的分类 JSON 文件（tasks/settings/ui/backups/notes/messages.json），
//   桌面桥缺失/不可用时自动回落 localStorage，两条路径共用同一组 load*/save* 入口。
import type { AppMessage, DailyDigestPayload, NoteItem, Task, Settings, ViewMode } from "../shared/types";
import { DEFAULT_SETTINGS, VIEW_MODES } from "../shared/types";
import { STORAGE_KEYS } from "../shared/constants";
import { normalizeTodoItems } from "../shared/types";
import { normalizeTags } from "../shared/tags";
import { normalizeGroup } from "../shared/groups";
import { expandLegacySpan, normalizeScheduledDays } from "../shared/taskDates";
import { MAX_MESSAGES } from "../shared/messages";
import { todayKey, toDateKey } from "./date";
import { getDesktopStorageBridge, type DesktopStorageFile } from "./desktopBridge";

// 已下线的历史键（备份队列 / 标签库），启动时清理一次，避免遗留占用空间
const LEGACY_KEYS = ["todo.backup.v1", "todo.tags.v1"];

// 存储键值联合（"todo.tasks.v1" 等，与 STORAGE_KEYS 的 value 一致）
type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// 存储键 → ~/.tuole 文件名（与主进程 STORAGE_FILES 白名单一致）
const STORAGE_FILES: Record<StorageKey, DesktopStorageFile> = {
  [STORAGE_KEYS.tasks]: "tasks.json",
  [STORAGE_KEYS.settings]: "settings.json",
  [STORAGE_KEYS.ui]: "ui.json",
  [STORAGE_KEYS.backups]: "backups.json",
  [STORAGE_KEYS.notes]: "notes.json",
  [STORAGE_KEYS.messages]: "messages.json",
};

// 桌面端写文件是异步的。手动刷新紧接着编辑时，优先读取本进程尚在写入的最新内容，
// 避免磁盘上暂时较旧的文件覆盖内存中的改动。
const pendingDesktopWrites = new Map<StorageKey, string>();

/** 原始读写分派：桌面版以 ~/.tuole 文件为唯一真相，浏览器版走 localStorage */
function readRaw(key: StorageKey): string | null {
  const bridge = getDesktopStorageBridge();
  if (bridge) {
    const pending = pendingDesktopWrites.get(key);
    if (pending !== undefined) return pending;
    const fromFile = bridge.readStorage(STORAGE_FILES[key]);
    if (fromFile !== null) return fromFile;
    // 文件缺失 = 桌面版首启（或旧版本升级）：回落 localStorage 旧数据，并异步迁移落盘；
    // 落盘成功后才清 localStorage 键——期间任何时刻断电，数据都至少存在于一处
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      bridge
        .writeStorage(STORAGE_FILES[key], legacy)
        .then(() => localStorage.removeItem(key))
        .catch(() => undefined);
    }
    return legacy;
  }
  return localStorage.getItem(key);
}

function writeRaw(key: StorageKey, text: string): void {
  const bridge = getDesktopStorageBridge();
  if (bridge) {
    // 主进程按文件串行合并、原子落盘；渲染层写为尽力而为（与 localStorage 写满静默降级同语义）
    pendingDesktopWrites.set(key, text);
    bridge.writeStorage(STORAGE_FILES[key], text)
      .then(() => {
        if (pendingDesktopWrites.get(key) === text) pendingDesktopWrites.delete(key);
      })
      .catch(() => undefined);
    return;
  }
  localStorage.setItem(key, text);
}

export function cleanupLegacyKeys(): void {
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

// 外部任务条目的形状归一（loadTasks 与 importTasks 共用的唯一迁移点）：
// - recurrence 已随「重复」功能整体移除而剥离（2026-10）；
// - tags / group 载入时归一（坏形状 → 空值）；
// - 待办项旧键折转：2026-10-09 待办项（原「子任务」）内部字段正名前，数据用旧键
//   `subtasks` 存待办项——此处折转到 `todos` 并剥离旧键。**这是全库唯一允许出现
//   该旧键名的位置**（删掉它，存量数据的待办项会整体丢失）；磁盘上的旧键副本在
//   下次写盘时自然清洗；
// - 执行期模型迁移（2026-10-09）：旧 `scheduledDate`/`dueDate` 连续区间在此展开为
//   `scheduledDates` 全量日期集合并剥离旧键（同样唯一允许出现旧键名的位置）
function sanitizeTaskEntry(
  entry: Task & { recurrence?: unknown; subtasks?: unknown; scheduledDate?: unknown; dueDate?: unknown },
): Task {
  const {
    recurrence: _recurrence,
    subtasks: _legacyTodos,
    scheduledDate: _legacyStart,
    dueDate: _legacyEnd,
    ...rest
  } = entry;
  // 新字段缺失/为空时才回退展开旧区间，避免把合法的「未安排」误判成旧数据
  const hasNewField = Array.isArray(entry.scheduledDates);
  const legacyDates =
    !hasNewField && typeof _legacyStart === "string"
      ? expandLegacySpan(_legacyStart, typeof _legacyEnd === "string" ? _legacyEnd : null)
      : [];
  const normalizedDates = normalizeScheduledDays(hasNewField ? entry.scheduledDates : legacyDates);
  const parkedDates = normalizeScheduledDays([entry.parkedDate]);
  const created = new Date(entry.createdAt);
  const fallbackDay = parkedDates[0] ?? (!Number.isNaN(created.getTime()) ? toDateKey(created) : todayKey());
  const scheduledDates = normalizedDates.length > 0 ? normalizedDates : [fallbackDay];
  const startedAt = typeof entry.startedAt === "string"
    ? entry.startedAt
    : entry.startedAt === null
      ? null
      : normalizedDates.length > 0
        ? (entry.updatedAt ?? entry.createdAt)
        : null;
  return {
    ...rest,
    scheduledDates,
    startedAt,
    tags: normalizeTags(entry.tags),
    group: normalizeGroup(entry.group),
    todos: normalizeTodoItems(entry.todos ?? _legacyTodos),
  } as Task;
}

/** 整批外部任务归一（旧快照/旧导出 JSON 恢复入口用）：见 sanitizeTaskEntry */
export function sanitizeTaskEntries(entries: Task[]): Task[] {
  return entries.map((entry) => sanitizeTaskEntry(entry));
}

export function loadTasks(): Task[] {
  try {
    const raw = readRaw(STORAGE_KEYS.tasks);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: Parameters<typeof sanitizeTaskEntry>[0]) => sanitizeTaskEntry(t));
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  try {
    writeRaw(STORAGE_KEYS.tasks, JSON.stringify(tasks));
  } catch {
    /* 存储满等异常静默降级，不阻塞 UI */
  }
}

export function loadSettings(): Settings {
  try {
    const raw = readRaw(STORAGE_KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    // fallbackShortcutEnabled / reminderTime 为已下线设置的遗留键：剥离防回流
    // （reminderTime 随 2026-10-18 提醒重构删除，磁盘副本在下次写盘时自然清洗）
    const parsed = JSON.parse(raw) as Partial<Settings> & { fallbackShortcutEnabled?: unknown; reminderTime?: unknown };
    delete parsed.fallbackShortcutEnabled;
    delete parsed.reminderTime;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    writeRaw(STORAGE_KEYS.settings, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// UI 态持久化载荷：目前只存视图模式，让刷新后停留在当前视图
export interface PersistedUiState {
  view: ViewMode; // 当前所在视图，缺失/非法时回退默认
}

const DEFAULT_UI_STATE: PersistedUiState = { view: "all" };

export function loadUiState(): PersistedUiState {
  try {
    const raw = readRaw(STORAGE_KEYS.ui);
    if (!raw) return { ...DEFAULT_UI_STATE };
    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;
    // 用运行时清单校验，坏 JSON / 历史残留的未知值一律回退默认视图
    const view = VIEW_MODES.find((v) => v === parsed.view) ?? DEFAULT_UI_STATE.view;
    return { view };
  } catch {
    return { ...DEFAULT_UI_STATE };
  }
}

export function saveUiState(state: PersistedUiState): void {
  try {
    writeRaw(STORAGE_KEYS.ui, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

// 单份任务备份快照（JSON 格式，含导出到本地文件时的完整载荷）
export interface TaskBackup {
  id: string; // 快照标识（创建时间戳）
  createdAt: string; // 创建时间 ISO
  taskCount: number; // 快照内任务数（列表展示用，冗余便于直读）
  tasks: Task[]; // 全量任务原始数据（不含派生 status）
}

export function loadBackups(): TaskBackup[] {
  try {
    const raw = readRaw(STORAGE_KEYS.backups);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 只收形状合法的快照，坏条目静默丢弃
    return parsed.filter(
      (b): b is TaskBackup =>
        b && typeof b.id === "string" && typeof b.createdAt === "string" && Array.isArray(b.tasks),
    );
  } catch {
    return [];
  }
}

export function saveBackups(backups: TaskBackup[]): void {
  try {
    writeRaw(STORAGE_KEYS.backups, JSON.stringify(backups));
  } catch {
    /* 存储满等异常静默降级：快照是尽力而为的兜底，不阻塞主流程 */
  }
}

// 备忘条目的形状归一：id/title 非法的坏条目丢弃（返回 null）、note 非字符串归 ""、
// createdAt 缺失/非法补当前时刻——备忘无历史迁移包袱，仅做防御性清洗
function sanitizeNoteEntry(entry: unknown): NoteItem | null {
  if (!entry || typeof entry !== "object") return null;
  const candidate = entry as Partial<NoteItem>;
  if (typeof candidate.id !== "string" || typeof candidate.title !== "string" || candidate.title.trim() === "") {
    return null;
  }
  const created = typeof candidate.createdAt === "string" && !Number.isNaN(Date.parse(candidate.createdAt))
    ? candidate.createdAt
    : new Date().toISOString();
  return {
    id: candidate.id,
    title: candidate.title,
    note: typeof candidate.note === "string" ? candidate.note : "",
    createdAt: created,
    ...(typeof candidate.updatedAt === "string" ? { updatedAt: candidate.updatedAt } : {}),
  };
}

export function loadNotes(): NoteItem[] {
  try {
    const raw = readRaw(STORAGE_KEYS.notes);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 只收形状合法的条目，坏条目静默丢弃（与 loadBackups 同纪律）
    return parsed
      .map((entry) => sanitizeNoteEntry(entry))
      .filter((entry): entry is NoteItem => entry !== null);
  } catch {
    return [];
  }
}

export function saveNotes(notes: NoteItem[]): void {
  try {
    writeRaw(STORAGE_KEYS.notes, JSON.stringify(notes));
  } catch {
    /* 存储满等异常静默降级，不阻塞 UI */
  }
}

// 消息条目的形状归一（2026-10-18 消息中心）：id/dayKey/digest 非法的坏条目丢弃（返回 null）、
// readAt 非字符串归 null（未读）；整体按 dayKey 降序 + 滚动保留最近 MAX_MESSAGES 条
function sanitizeMessageEntry(entry: unknown): AppMessage | null {
  if (!entry || typeof entry !== "object") return null;
  const candidate = entry as Partial<AppMessage> & { digest?: Partial<AppMessage["digest"]> };
  if (typeof candidate.id !== "string" || typeof candidate.dayKey !== "string" || candidate.kind !== "dailyDigest") {
    return null;
  }
  const digest = candidate.digest;
  if (!digest || typeof digest.todayCount !== "number" || typeof digest.overdueCount !== "number" || !Array.isArray(digest.tasks)) {
    return null;
  }
  return {
    id: candidate.id,
    kind: "dailyDigest",
    dayKey: candidate.dayKey,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
    readAt: typeof candidate.readAt === "string" ? candidate.readAt : null,
    digest: {
      todayCount: digest.todayCount,
      overdueCount: digest.overdueCount,
      // 任务引用只收形状合法条目（taskId/title 双字符串），防脏数据撑爆存储
      tasks: digest.tasks.filter(
        (entry): entry is DailyDigestPayload["tasks"][number] =>
          !!entry && typeof entry === "object" &&
          typeof (entry as DailyDigestPayload["tasks"][number]).taskId === "string" &&
          typeof (entry as DailyDigestPayload["tasks"][number]).title === "string",
      ),
      hiddenCount: typeof digest.hiddenCount === "number" ? digest.hiddenCount : 0,
    },
  };
}

export function loadMessages(): AppMessage[] {
  try {
    const raw = readRaw(STORAGE_KEYS.messages);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 只收形状合法的条目（与 loadNotes 同纪律），按 dayKey 降序（新→旧）+ 滚动截断
    return parsed
      .map((entry) => sanitizeMessageEntry(entry))
      .filter((entry): entry is AppMessage => entry !== null)
      .sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0))
      .slice(0, MAX_MESSAGES);
  } catch {
    return [];
  }
}

export function saveMessages(messages: AppMessage[]): void {
  try {
    writeRaw(STORAGE_KEYS.messages, JSON.stringify(messages));
  } catch {
    /* 存储满等异常静默降级：消息是提醒通知，丢失不阻塞主流程 */
  }
}

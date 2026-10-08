// 本地持久化（完全离线、数据不出本机）：
// - 浏览器版：localStorage；
// - 桌面版（Electron）：用户目录 ~/.tuole 下的分类 JSON 文件（tasks/settings/ui/backups.json），
//   桌面桥缺失/不可用时自动回落 localStorage，两条路径共用同一组 load*/save* 入口。
import type { Task, Settings, ViewMode } from "../shared/types";
import { DEFAULT_SETTINGS, VIEW_MODES } from "../shared/types";
import { STORAGE_KEYS } from "../shared/constants";
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

export function loadTasks(): Task[] {
  try {
    const raw = readRaw(STORAGE_KEYS.tasks);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 去掉历史版本残留的 tags / recurrence 字段（recurrence 随「重复」功能整体移除而剥离，2026-10）
    return parsed.map((t: Task & { tags?: unknown; recurrence?: unknown }) => {
      const { tags: _tags, recurrence: _recurrence, ...rest } = t;
      return rest as Task;
    });
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
    const parsed = JSON.parse(raw) as Partial<Settings> & { fallbackShortcutEnabled?: unknown };
    delete parsed.fallbackShortcutEnabled;
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

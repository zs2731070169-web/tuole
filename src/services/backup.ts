// 备份引擎：按设置间隔或在覆盖任务前做「应用内滚动快照」（localStorage），支持恢复 / 导出 JSON / 从文件导入。
// 桌面版通过 preload 安全桥把同一份滚动列表镜像为应用数据目录里的 JSON 文件，
// 备份文件导入/导出也走原生文件面板；浏览器版仍使用应用内快照与下载导出。
import { useTaskStore } from "../stores/useTaskStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { loadBackups, saveBackups, type TaskBackup } from "../lib/storage";
import { isDesktopApp, saveDesktopFileDialog, syncDesktopBackups, writeDesktopFile } from "../lib/desktopBridge";
import type { Task } from "../shared/types";

// 滚动保留的快照数：新快照插入队首，超出即淘汰最旧的
export const MAX_BACKUPS = 10;
// 检查节拍：每分钟醒一次，结合设置间隔与数据变更判定是否该拍快照（节拍与间隔解耦，改设置即时生效）
const CHECK_TICK_MS = 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let lastSignature: string | null = null; // 上次快照时的任务数据签名（未变更不重复拍）
let lastBackupAt = 0; // 上次成功快照的时间戳（ms）
let desktopSyncPromise: Promise<void> = Promise.resolve();

function queueDesktopBackupSync(backups: TaskBackup[]): void {
  desktopSyncPromise = desktopSyncPromise
    .then(() => syncDesktopBackups(backups))
    .then(() => undefined)
    .catch(() => undefined);
}

/** 等待已经排队的桌面文件同步完成，打开目录前使用，避免看到旧列表。 */
export function flushDesktopBackupSync(): Promise<void> {
  return desktopSyncPromise;
}

/** 生成一份全量任务快照 */
export function createBackup(tasks: Task[], now = new Date()): TaskBackup {
  return {
    id: `bk-${now.getTime()}`,
    createdAt: now.toISOString(),
    taskCount: tasks.length,
    tasks: tasks.map((t) => ({ ...t })),
  };
}

/** 写入快照并滚动淘汰（最新的在队首），返回写入后的列表 */
export function saveSnapshot(backup: TaskBackup): TaskBackup[] {
  const next = [backup, ...loadBackups().filter((b) => b.id !== backup.id)].slice(0, MAX_BACKUPS);
  saveBackups(next);
  queueDesktopBackupSync(next);
  return next;
}

export function listBackups(): TaskBackup[] {
  return loadBackups();
}

export function deleteBackup(id: string): void {
  const next = loadBackups().filter((b) => b.id !== id);
  saveBackups(next);
  queueDesktopBackupSync(next);
}

/** 保存当前任务快照；自动备份与覆盖前恢复点共用，数据未变化时不重复保存。
 *  无任务时不备份（2026-10 用户决策）：空数据快照没有恢复价值，还会在桌面镜像目录
 *  产出无意义文件——零任务期间自动备份等同暂停（定时器仍空转，不产生任何快照/文件）；
 *  且此路径不更新 lastSignature，首个任务出现后下一次到期 tick 即会正常拍快照。 */
export function saveCurrentSnapshot(now = new Date()): TaskBackup | null {
  const tasks = useTaskStore.getState().tasks;
  if (tasks.length === 0) return null;
  const signature = JSON.stringify(tasks);
  if (signature === lastSignature) return null; // 数据没变，不拍重复快照
  lastSignature = signature;
  lastBackupAt = now.getTime();
  const backup = createBackup(tasks, now);
  saveSnapshot(backup);
  return backup;
}

/**
 * 用新数据替换全部任务前，先保存当前状态作为恢复点。
 * Excel 替换导入、应用内快照恢复、JSON 文件恢复统一走这里，避免任何覆盖入口漏备份。
 */
export function replaceTasksWithRecoveryPoint(tasks: Task[]): number {
  saveCurrentSnapshot();
  return useTaskStore.getState().importTasks(tasks.map((task) => ({ ...task })), "replace");
}

/** 用快照替换当前全部任务；覆盖前自动保存当前状态 */
export function restoreFromBackup(backup: TaskBackup): number {
  return replaceTasksWithRecoveryPoint(backup.tasks);
}

/** 把快照导出为本地 JSON 文件；桌面版先打开原生保存面板，再异步写入。 */
export async function exportBackupToFile(backup: TaskBackup): Promise<boolean> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date(backup.createdAt);
  const fileName = `tuole-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;

  if (isDesktopApp) {
    const picked = await saveDesktopFileDialog({
      title: "导出备份",
      defaultPath: fileName,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!picked?.filePath) return false;
    await nextFrame();
    const payload = JSON.stringify({ version: 1, createdAt: backup.createdAt, taskCount: backup.taskCount, tasks: backup.tasks }, null, 2);
    await writeDesktopFile(picked.filePath, new TextEncoder().encode(payload));
    return true;
  }

  const payload = JSON.stringify({ version: 1, createdAt: backup.createdAt, taskCount: backup.taskCount, tasks: backup.tasks }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** 解析本地 JSON 备份文件：接受导出格式（{tasks:[...]}）或纯任务数组；形状非法返回 null */
export function parseBackupFile(raw: string): Task[] | null {
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tasks) ? parsed.tasks : null;
    if (!arr) return null;
    const tasks = arr.filter(
      (t: unknown): t is Task =>
        !!t &&
        typeof (t as Task).id === "string" &&
        typeof (t as Task).title === "string" &&
        // 执行期字段：新模型（scheduledDates 数组）或旧区间（scheduledDate）任一存在即算合法条目，
        // 归一到新模型由 importTasks → sanitizeTaskEntries 统一完成
        (Array.isArray((t as Task).scheduledDates) ||
          typeof (t as { scheduledDate?: unknown }).scheduledDate !== "undefined"),
    );
    return tasks.length > 0 ? tasks : null;
  } catch {
    return null;
  }
}

/**
 * 启动自动备份引擎：每分钟检查一次——
 * 开关开启 && 距上次快照 ≥ 设置间隔 && 任务数据有变更 → 拍快照。
 * 设置在每次 tick 现读，改开关/间隔无需重启应用。
 */
export function startAutoBackup(): void {
  if (timer) clearInterval(timer);
  // 启动时先把 localStorage 里已有的快照补镜像到桌面目录。
  queueDesktopBackupSync(loadBackups());
  timer = setInterval(() => {
    const { autoBackupEnabled, autoBackupIntervalMinutes } = useSettingsStore.getState().settings;
    if (!autoBackupEnabled) return;
    if (Date.now() - lastBackupAt < autoBackupIntervalMinutes * 60 * 1000) return;
    saveCurrentSnapshot();
  }, CHECK_TICK_MS);
}

export function stopAutoBackup(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

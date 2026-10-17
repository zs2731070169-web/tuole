import type { NoteItem, Task } from "../shared/types";
import type { TaskBackup } from "./storage";

export interface DesktopBridgeResult {
  ok: boolean;
  path?: string;
  error?: string;
}

// ~/.tuole 数据目录下的分类存储文件（与主进程 STORAGE_FILES 白名单一致）
export type DesktopStorageFile =
  | "tasks.json"
  | "settings.json"
  | "ui.json"
  | "backups.json"
  | "notes.json"
  | "messages.json";

export interface DesktopFileDialogFilter {
  name: string;
  extensions: string[];
}

export interface DesktopOpenFileResult {
  canceled: boolean;
  data?: ArrayBuffer;
}

export interface DesktopSaveFileResult {
  canceled: boolean;
  filePath?: string;
}

export interface DesktopExcelOptions {
  title?: string;
  defaultPath?: string;
  /** 导出载荷域（2026-10-18 备忘导入导出）：主进程据此选工作簿构造器，缺省 = 任务 */
  kind?: "tasks" | "notes";
}

export interface DesktopExcelResult {
  canceled: boolean;
  filePath?: string;
  data?: ArrayBuffer;
}

export interface DesktopBridge {
  isDesktop: true;
  // 同步读（sendSync）：供渲染层模块加载期取得首帧数据；无数据返回 null
  readStorage: (file: DesktopStorageFile) => string | null;
  // 异步写（invoke）：主进程按文件串行合并、原子落盘，尽力而为不阻塞 UI
  writeStorage: (file: DesktopStorageFile, text: string) => Promise<void>;
  // 原生文件面板：先选路径再读写，避免渲染层和系统面板抢同一帧
  openFile: (options: { title?: string; filters?: DesktopFileDialogFilter[] }) => Promise<DesktopOpenFileResult>;
  saveFileDialog: (options: {
    title?: string;
    defaultPath?: string;
    filters?: DesktopFileDialogFilter[];
  }) => Promise<DesktopSaveFileResult>;
  writeFile: (filePath: string, data: ArrayBuffer | Uint8Array) => Promise<void>;
  exportExcel: (rows: Task[] | NoteItem[], options?: DesktopExcelOptions) => Promise<DesktopExcelResult>;
  importExcel: (options?: Pick<DesktopExcelOptions, "title">) => Promise<DesktopExcelResult>;
  syncBackups: (backups: TaskBackup[]) => Promise<DesktopBridgeResult>;
  openBackupDirectory: () => Promise<DesktopBridgeResult>;
}

declare global {
  interface Window {
    tuoleDesktop?: DesktopBridge;
  }
}

export const isDesktopApp = typeof window !== "undefined" && window.tuoleDesktop?.isDesktop === true;

/** 桌面文件存储桥；浏览器环境（无 tuoleDesktop 或缺存储接口）返回 null，storage 层回落 localStorage */
export function getDesktopStorageBridge(): DesktopBridge | null {
  return typeof window !== "undefined" && window.tuoleDesktop?.readStorage ? window.tuoleDesktop : null;
}

export function openDesktopFile(options: {
  title?: string;
  filters?: DesktopFileDialogFilter[];
}): Promise<DesktopOpenFileResult | null> {
  return typeof window !== "undefined" && window.tuoleDesktop?.openFile
    ? window.tuoleDesktop.openFile(options)
    : Promise.resolve(null);
}

export function saveDesktopFileDialog(options: {
  title?: string;
  defaultPath?: string;
  filters?: DesktopFileDialogFilter[];
}): Promise<DesktopSaveFileResult | null> {
  return typeof window !== "undefined" && window.tuoleDesktop?.saveFileDialog
    ? window.tuoleDesktop.saveFileDialog(options)
    : Promise.resolve(null);
}

export function writeDesktopFile(filePath: string, data: ArrayBuffer | Uint8Array): Promise<void> {
  return typeof window !== "undefined" && window.tuoleDesktop?.writeFile
    ? window.tuoleDesktop.writeFile(filePath, data)
    : Promise.reject(new Error("Desktop file bridge unavailable"));
}

export function exportDesktopExcel(
  rows: Task[] | NoteItem[],
  options?: DesktopExcelOptions,
): Promise<DesktopExcelResult | null> {
  return typeof window !== "undefined" && window.tuoleDesktop?.exportExcel
    ? window.tuoleDesktop.exportExcel(rows, options)
    : Promise.resolve(null);
}

export function importDesktopExcel(options?: Pick<DesktopExcelOptions, "title">): Promise<DesktopExcelResult | null> {
  return typeof window !== "undefined" && window.tuoleDesktop?.importExcel
    ? window.tuoleDesktop.importExcel(options)
    : Promise.resolve(null);
}

export function syncDesktopBackups(backups: TaskBackup[]): Promise<DesktopBridgeResult | null> {
  return typeof window !== "undefined" && window.tuoleDesktop
    ? window.tuoleDesktop.syncBackups(backups)
    : Promise.resolve(null);
}

export function openDesktopBackupDirectory(): Promise<DesktopBridgeResult | null> {
  return typeof window !== "undefined" && window.tuoleDesktop
    ? window.tuoleDesktop.openBackupDirectory()
    : Promise.resolve(null);
}

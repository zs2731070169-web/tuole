// Excel 任务导入/导出（SheetJS，纯前端离线）
// 任务与待办项分表（2026-10 由「子任务」更名，导入兼容旧「子任务」表名）：任务用本次导出的序号关联，应用内部 id 不进入报表。
// 备忘（2026-10-18）另有独立的「备忘」表往返（buildNotesWorkbook / parseNotesFromWorkbook），与任务表互不相干。
import * as XLSX from "xlsx";
import type { NoteItem, Task, Priority, Todo } from "../shared/types";
import { makeId, emptyTask } from "../stores/useTaskStore";
import { parseTags, formatTags } from "../shared/tags";
import { expandLegacySpan, isContiguousDays } from "../shared/taskDates";
import { todayKey } from "./date";

const SHEET = "任务";
const NOTES_SHEET = "备忘";
const TODO_SHEET = "待办项";
// 旧版导出文件里的待办项表名（导入时兼容识别，导出恒用新名）
const LEGACY_TODO_SHEET = "子任务";
const META_SHEET = "__妥了关联";
const HEADERS = [
  "序号",
  "标题",
  "备注",
  "标签",
  "分组",
  "优先级",
  "安排日期",
  "截止日期",
  "创建时间",
  "完成时间",
] as const;
const TODO_HEADERS = ["所属任务序号", "所属任务标题", "待办项", "已完成"] as const;
const NOTES_HEADERS = ["序号", "标题", "备注", "创建时间"] as const;

const PRIORITY_LABEL: Record<Priority, string> = { high: "高", medium: "中", low: "低", none: "无" };
const LABEL_PRIORITY: Record<string, Priority> = { 高: "high", 中: "medium", 低: "low", 无: "none", "": "none" };
/** 'YYYY-MM-DD' 形式取前 10 位；无法识别返回 null */
function dateCell(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    // Excel 序列号日期
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
  }
  return null;
}

function isoCell(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    // Excel 单元格存的是本地墙上时间；读回时重新按本地时间构造 ISO。
    const wall = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
    const local = new Date(
      wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(),
      wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds(), wall.getUTCMilliseconds(),
    );
    return local.toISOString();
  }
  const s = String(v).trim().replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, "$1T$2");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function excelLocalDateTime(iso: string | null): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const wall = Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds(),
  );
  return (wall - Date.UTC(1899, 11, 30)) / 86400000;
}

// 执行期导出单元格：连续 = 首日（截止日期列承载末日）；分散（拖拽逐日移动产生）=
// 顿号连接全量日期列表（截止日期列留空，避免与列表重复）
function scheduledCell(task: Task): string {
  if (isContiguousDays(task)) return task.scheduledDates[0] ?? "";
  return task.scheduledDates.join("、");
}

// 执行期导入：安排日期列支持顿号/逗号分隔多值（分散导出的往返）；单值 + 截止日期 =
// 连续区间展开（旧表与连续导出的往返）
function parseScheduledDates(startDateCell: unknown, endDateCell: unknown): string[] {
  const raw = String(startDateCell ?? "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/[,，、;；|｜]+/)
    .map((part) => dateCell(part))
    .filter((d): d is string => !!d);
  const unique = [...new Set(parts)].sort();
  if (unique.length !== 1) return unique;
  const end = dateCell(endDateCell);
  return end && end > unique[0] ? expandLegacySpan(unique[0], end) : unique;
}

function parseTodos(text: string): Todo[] {
  if (!text.trim()) return [];
  return text
    .split(/[|｜\n]/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const done = /^\[[xX✓]\]/.test(raw);
      const title = raw.replace(/^\[(?:[xX✓]| )\]\s*/, "").replace(/^-\s*/, "").trim();
      return { id: makeId(), title: title || "待办项", done };
    });
}

export function buildTaskWorkbook(tasks: Task[]): XLSX.WorkBook {
  const rows = tasks.map((t, index) => ({
    序号: index + 1,
    标题: t.title,
    备注: t.note,
    标签: formatTags(t.tags),
    分组: t.group ?? "",
    优先级: PRIORITY_LABEL[t.priority],
    安排日期: scheduledCell(t),
    截止日期: isContiguousDays(t) && t.scheduledDates.length > 1 ? t.scheduledDates[t.scheduledDates.length - 1] : "",
    创建时间: "",
    完成时间: "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...HEADERS] });
  tasks.forEach((task, index) => {
    // 标签/分组列插在备注之后：创建/完成时间列号随之右移两位（8/9）
    for (const [column, iso] of [[8, task.createdAt], [9, task.completedAt]] as const) {
      const serial = excelLocalDateTime(iso);
      if (serial !== null) {
        ws[XLSX.utils.encode_cell({ r: index + 1, c: column })] = {
          t: "n", v: serial, z: "yyyy-mm-dd hh:mm:ss",
        };
      }
    }
  });
  ws["!cols"] = [
    { wch: 8 }, { wch: 30 }, { wch: 40 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET);
  const subRows = tasks.flatMap((task, index) => task.todos.map((todo) => ({
    所属任务序号: index + 1,
    所属任务标题: task.title,
    待办项: todo.title,
    已完成: todo.done ? "是" : "否",
  })));
  if (subRows.length > 0) {
    const todoSheet = XLSX.utils.json_to_sheet(subRows, { header: [...TODO_HEADERS] });
    todoSheet["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 40 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, todoSheet, TODO_SHEET);
  }
  // 只供应用再次导入时精确匹配；普通工作表不展示内部标识。
  const meta = XLSX.utils.json_to_sheet(tasks.map((task, index) => ({
    序号: index + 1,
    关联: task.id,
    // 隐藏往返元数据：日期与生命周期独立，未安排任务也有日期。
    已开始: task.startedAt ?? "",
  })));
  XLSX.utils.book_append_sheet(wb, meta, META_SHEET);
  wb.Workbook = { Sheets: wb.SheetNames.map((name) => ({ Hidden: name === META_SHEET ? 2 : 0 })) };
  return wb;
}

export function exportTasksToXlsx(tasks: Task[], fileName?: string): void {
  const name = fileName ?? `妥了任务_${todayKey()}.xlsx`;
  XLSX.writeFile(buildTaskWorkbook(tasks), name);
}

export interface ParseResult {
  tasks: Task[];
  skipped: number; // 无标题而被跳过的行数
  hasTagsColumn: boolean; // 文件任务表是否含「标签」列：无列时导入更新不得清空存量标签（旧版导出兼容）
  hasGroupColumn: boolean; // 同上，「分组」列（2026-10-09 新增）
}

// 表头列是否存在（与 pick 同口径的匹配：先精确、后包含；任一行命中即算存在）
function hasColumn(rows: Record<string, unknown>[], keys: string[]): boolean {
  return rows.some((row) =>
    Object.keys(row).some((k) => {
      const norm = k.trim().toLowerCase();
      return keys.some((want) => norm === want || norm.includes(want));
    }),
  );
}

// 分组单元格 → 单值分组：trim 后非空才有效，空/缺失 = 无分组
function groupCell(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

// 表头取值（任务/备忘解析共用）：先精确匹配、后包含匹配（均大小写不敏感），缺列返回 ""
function pickCell(row: Record<string, unknown>, keys: string[]): unknown {
  for (const want of keys) {
    const exact = Object.keys(row).find((key) => key.trim().toLowerCase() === want);
    if (exact) return row[exact];
  }
  for (const k of Object.keys(row)) {
    const norm = String(k).trim().toLowerCase();
    if (keys.some((want) => norm === want || norm.includes(want))) return row[k];
  }
  return "";
}

/** 解析上传的表格文件（xlsx/xls/csv），按表头名匹配列，缺列走默认值 */
export function parseTasksFromWorkbook(data: ArrayBuffer): ParseResult {
  const wb = XLSX.read(data, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return { tasks: [], skipped: 0, hasTagsColumn: false, hasGroupColumn: false };
  const sheet = wb.Sheets[first];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const hasTagsColumn = hasColumn(json, ["标签", "tags"]);
  const hasGroupColumn = hasColumn(json, ["分组", "group"]);

  let base = Date.now();
  let skipped = 0;
  const tasks: Task[] = [];
  const byExportNumber = new Map<number, Task>();
  const sourceIds = new Map<number, string>();
  const sourceStartedAt = new Map<number, string | null>();
  const metaSheet = wb.Sheets[META_SHEET];
  if (metaSheet) {
    for (const row of XLSX.utils.sheet_to_json<Record<string, unknown>>(metaSheet, { defval: "" })) {
      const number = Number(pickCell(row, ["序号"]));
      const id = String(pickCell(row, ["关联"]) ?? "").trim();
      if (Number.isInteger(number) && number > 0 && id) sourceIds.set(number, id);
      if (Number.isInteger(number) && number > 0 && Object.prototype.hasOwnProperty.call(row, "已开始")) {
        sourceStartedAt.set(number, isoCell(row["已开始"]));
      }
    }
  }
  for (const row of json) {
    const title = String(pickCell(row, ["标题", "title", "任务"]) ?? "").trim();
    if (!title) {
      skipped++;
      continue;
    }
    const completedAt = isoCell(pickCell(row, ["完成时间", "completed"]));
    const createdAt = isoCell(pickCell(row, ["创建时间", "created"])) ?? new Date(base).toISOString();
    const exportNumber = Number(pickCell(row, ["序号"]));
    const id = sourceIds.get(exportNumber) || String(pickCell(row, ["id"]) ?? "").trim() || makeId();

    const scheduledDates = parseScheduledDates(pickCell(row, ["安排日期", "scheduled"]), pickCell(row, ["截止日期", "截止", "due"]));
    const task: Task = {
      ...emptyTask(),
      id,
      title,
      note: String(pickCell(row, ["说明", "备注", "note"]) ?? ""),
      tags: parseTags(String(pickCell(row, ["标签", "tags"]) ?? "")),
      group: groupCell(pickCell(row, ["分组", "group"])),
      priority: LABEL_PRIORITY[String(pickCell(row, ["优先级", "priority"]) ?? "").trim()] ?? "none",
      scheduledDates,
      startedAt: sourceStartedAt.has(exportNumber)
        ? sourceStartedAt.get(exportNumber)!
        : scheduledDates.length > 0 ? createdAt : null,
      todos: parseTodos(String(pickCell(row, ["待办项", "子任务", "todo"]) ?? "")),
      createdAt,
      completedAt,
      completedReason: completedAt ? "manual" : null,
      sortOrder: base++,
    };
    tasks.push(task);
    if (Number.isInteger(exportNumber) && exportNumber > 0) byExportNumber.set(exportNumber, task);
  }
  // 待办项分表：新名「待办项」，旧版导出的「子任务」表同样识别（列头两个名字都认）
  const subSheet = wb.Sheets[TODO_SHEET] ?? wb.Sheets[LEGACY_TODO_SHEET];
  if (subSheet) {
    const subRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(subSheet, { defval: "" });
    for (const row of subRows) {
      const parent = byExportNumber.get(Number(pickCell(row, ["所属任务序号"])));
      const title = String(pickCell(row, ["待办项", "子任务"]) ?? "").trim();
      if (!parent || !title) continue;
      const done = /^(是|已完成|true|1|yes|y)$/i.test(String(pickCell(row, ["已完成"]) ?? "").trim());
      parent.todos.push({ id: makeId(), title, done });
    }
  }
  return { tasks, skipped, hasTagsColumn, hasGroupColumn };
}

// ── 备忘表往返（2026-10-18）───────────────────────────────────────────────
// 与任务表同构的工艺：创建时间列写数值日期单元格（本地墙上时间往返）、隐藏 __妥了关联
// 表携带内部 id 供导入精确去重；但结构刻意精简——备忘只有 标题/备注/创建时间 三列数据。

export function buildNotesWorkbook(notes: NoteItem[]): XLSX.WorkBook {
  const rows = notes.map((note, index) => ({
    序号: index + 1,
    标题: note.title,
    备注: note.note,
    创建时间: "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...NOTES_HEADERS] });
  notes.forEach((note, index) => {
    // 创建时间列号 = 3（序号/标题/备注之后）
    const serial = excelLocalDateTime(note.createdAt);
    if (serial !== null) {
      ws[XLSX.utils.encode_cell({ r: index + 1, c: 3 })] = { t: "n", v: serial, z: "yyyy-mm-dd hh:mm:ss" };
    }
  });
  ws["!cols"] = [{ wch: 8 }, { wch: 30 }, { wch: 40 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, NOTES_SHEET);
  const meta = XLSX.utils.json_to_sheet(notes.map((note, index) => ({ 序号: index + 1, 关联: note.id })));
  XLSX.utils.book_append_sheet(wb, meta, META_SHEET);
  wb.Workbook = { Sheets: wb.SheetNames.map((name) => ({ Hidden: name === META_SHEET ? 2 : 0 })) };
  return wb;
}

export function exportNotesToXlsx(notes: NoteItem[], fileName?: string): void {
  const name = fileName ?? `妥了备忘_${todayKey()}.xlsx`;
  XLSX.writeFile(buildNotesWorkbook(notes), name);
}

export interface NotesParseResult {
  notes: NoteItem[];
  skipped: number; // 无标题而被跳过的行数
}

/** 解析备忘表格（xlsx/xls/csv）：优先取「备忘」表（应用导出的文件），无则回落首表
 *  （手工整理的文件）；标题必填、创建时间缺失补基准时刻、隐藏关联表回填内部 id。 */
export function parseNotesFromWorkbook(data: ArrayBuffer): NotesParseResult {
  const wb = XLSX.read(data, { type: "array" });
  const sheetName = wb.SheetNames.find((name) => name === NOTES_SHEET) ?? wb.SheetNames[0];
  if (!sheetName) return { notes: [], skipped: 0 };
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });

  // 隐藏关联表：序号 → 内部 id（只供应用再次导入时精确去重）
  const sourceIds = new Map<number, string>();
  const metaSheet = wb.Sheets[META_SHEET];
  if (metaSheet) {
    for (const row of XLSX.utils.sheet_to_json<Record<string, unknown>>(metaSheet, { defval: "" })) {
      const number = Number(pickCell(row, ["序号"]));
      const id = String(pickCell(row, ["关联"]) ?? "").trim();
      if (Number.isInteger(number) && number > 0 && id) sourceIds.set(number, id);
    }
  }

  let base = Date.now();
  let skipped = 0;
  const notes: NoteItem[] = [];
  for (const row of json) {
    const title = String(pickCell(row, ["标题", "title", "备忘"]) ?? "").trim();
    if (!title) {
      skipped++;
      continue;
    }
    notes.push({
      id: sourceIds.get(Number(pickCell(row, ["序号"]))) || String(pickCell(row, ["id"]) ?? "").trim() || makeId(),
      title,
      note: String(pickCell(row, ["说明", "备注", "note"]) ?? ""),
      createdAt: isoCell(pickCell(row, ["创建时间", "created"])) ?? new Date(base++).toISOString(),
    });
  }
  return { notes, skipped };
}

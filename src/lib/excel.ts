// Excel 任务导入/导出（SheetJS，纯前端离线）
// 任务与子任务分表：任务用本次导出的序号关联，应用内部 id 不进入报表。
import * as XLSX from "xlsx";
import type { Task, Priority, Subtask } from "../shared/types";
import { makeId, emptyTask } from "../stores/useTaskStore";
import { todayKey } from "./date";

const SHEET = "任务";
const SUBTASK_SHEET = "子任务";
const META_SHEET = "__妥了关联";
const HEADERS = [
  "序号",
  "标题",
  "说明",
  "优先级",
  "安排日期",
  "截止日期",
  "创建时间",
  "完成时间",
] as const;
const SUBTASK_HEADERS = ["所属任务序号", "所属任务标题", "子任务", "已完成"] as const;

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

function parseSubtasks(text: string): Subtask[] {
  if (!text.trim()) return [];
  return text
    .split(/[|｜\n]/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const done = /^\[[xX✓]\]/.test(raw);
      const title = raw.replace(/^\[(?:[xX✓]| )\]\s*/, "").replace(/^-\s*/, "").trim();
      return { id: makeId(), title: title || "子任务", done };
    });
}

export function buildTaskWorkbook(tasks: Task[]): XLSX.WorkBook {
  const rows = tasks.map((t, index) => ({
    序号: index + 1,
    标题: t.title,
    说明: t.note,
    优先级: PRIORITY_LABEL[t.priority],
    安排日期: t.scheduledDate ?? "",
    截止日期: t.dueDate ?? "",
    创建时间: "",
    完成时间: "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...HEADERS] });
  tasks.forEach((task, index) => {
    for (const [column, iso] of [[6, task.createdAt], [7, task.completedAt]] as const) {
      const serial = excelLocalDateTime(iso);
      if (serial !== null) {
        ws[XLSX.utils.encode_cell({ r: index + 1, c: column })] = {
          t: "n", v: serial, z: "yyyy-mm-dd hh:mm:ss",
        };
      }
    }
  });
  ws["!cols"] = [
    { wch: 8 }, { wch: 30 }, { wch: 40 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET);
  const subRows = tasks.flatMap((task, index) => task.subtasks.map((sub) => ({
    所属任务序号: index + 1,
    所属任务标题: task.title,
    子任务: sub.title,
    已完成: sub.done ? "是" : "否",
  })));
  if (subRows.length > 0) {
    const subs = XLSX.utils.json_to_sheet(subRows, { header: [...SUBTASK_HEADERS] });
    subs["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 40 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, subs, SUBTASK_SHEET);
  }
  // 只供应用再次导入时精确匹配；普通工作表不展示内部标识。
  const meta = XLSX.utils.json_to_sheet(tasks.map((task, index) => ({ 序号: index + 1, 关联: task.id })));
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
}

/** 解析上传的表格文件（xlsx/xls/csv），按表头名匹配列，缺列走默认值 */
export function parseTasksFromWorkbook(data: ArrayBuffer): ParseResult {
  const wb = XLSX.read(data, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return { tasks: [], skipped: 0 };
  const sheet = wb.Sheets[first];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
    for (const want of keys) {
      const exact = Object.keys(row).find((key) => key.trim().toLowerCase() === want);
      if (exact) return row[exact];
    }
    for (const k of Object.keys(row)) {
      const norm = String(k).trim().toLowerCase();
      if (keys.some((want) => norm === want || norm.includes(want))) return row[k];
    }
    return "";
  };

  let base = Date.now();
  let skipped = 0;
  const tasks: Task[] = [];
  const byExportNumber = new Map<number, Task>();
  const sourceIds = new Map<number, string>();
  const metaSheet = wb.Sheets[META_SHEET];
  if (metaSheet) {
    for (const row of XLSX.utils.sheet_to_json<Record<string, unknown>>(metaSheet, { defval: "" })) {
      const number = Number(pick(row, ["序号"]));
      const id = String(pick(row, ["关联"]) ?? "").trim();
      if (Number.isInteger(number) && number > 0 && id) sourceIds.set(number, id);
    }
  }
  for (const row of json) {
    const title = String(pick(row, ["标题", "title", "任务"]) ?? "").trim();
    if (!title) {
      skipped++;
      continue;
    }
    const completedAt = isoCell(pick(row, ["完成时间", "completed"]));
    const createdAt = isoCell(pick(row, ["创建时间", "created"])) ?? new Date(base).toISOString();
    const exportNumber = Number(pick(row, ["序号"]));
    const id = sourceIds.get(exportNumber) || String(pick(row, ["id"]) ?? "").trim() || makeId();

    const task: Task = {
      ...emptyTask(),
      id,
      title,
      note: String(pick(row, ["说明", "备注", "note"]) ?? ""),
      priority: LABEL_PRIORITY[String(pick(row, ["优先级", "priority"]) ?? "").trim()] ?? "none",
      scheduledDate: dateCell(pick(row, ["安排日期", "scheduled"])),
      dueDate: dateCell(pick(row, ["截止日期", "截止", "due"])),
      subtasks: parseSubtasks(String(pick(row, ["子任务", "subtask"]) ?? "")),
      createdAt,
      completedAt,
      completedReason: completedAt ? "manual" : null,
      sortOrder: base++,
    };
    tasks.push(task);
    if (Number.isInteger(exportNumber) && exportNumber > 0) byExportNumber.set(exportNumber, task);
  }
  const subSheet = wb.Sheets[SUBTASK_SHEET];
  if (subSheet) {
    const subRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(subSheet, { defval: "" });
    for (const row of subRows) {
      const parent = byExportNumber.get(Number(pick(row, ["所属任务序号"])));
      const title = String(pick(row, ["子任务"]) ?? "").trim();
      if (!parent || !title) continue;
      const done = /^(是|已完成|true|1|yes|y)$/i.test(String(pick(row, ["已完成"]) ?? "").trim());
      parent.subtasks.push({ id: makeId(), title, done });
    }
  }
  return { tasks, skipped };
}

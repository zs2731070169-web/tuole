import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildNotesWorkbook, buildTaskWorkbook, parseNotesFromWorkbook, parseTasksFromWorkbook } from "../src/lib/excel";
import { selectNotesForExcel, selectTasksForExcel } from "../src/lib/excelScope";
import { planExcelImport } from "../src/shared/excelImport";
import { EMPTY_FILTER } from "../src/shared/filter";
import type { NoteItem, Task } from "../src/shared/types";

const require = createRequire(import.meta.url);
const { buildExcelBuffer, buildNotesExcelBuffer } = require("../electron/excel.cjs") as {
  buildExcelBuffer: (tasks: Task[]) => Buffer;
  buildNotesExcelBuffer: (notes: NoteItem[]) => Buffer;
};

const localMorning = new Date(2026, 9, 8, 1, 19, 34);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    title: "整理资料",
    note: "核对内容",
    priority: "medium",
    tags: ["工作", "复盘"],
    group: "产品设计",
    scheduledDates: ["2026-10-08"],todos: [
      { id: "sub-1", title: "收集文件", done: true },
      { id: "sub-2", title: "整理目录", done: false },
    ],
    createdAt: localMorning.toISOString(),
    completedAt: localMorning.toISOString(),
    completedReason: "manual",
    sortOrder: 1,
    ...overrides,
  };
}

describe("Excel 导出范围", () => {
  const now = new Date(2026, 9, 8, 1, 30);
  const common = {
    filter: EMPTY_FILTER,
    calendarDay: "2026-10-08",
    calendarAnchor: new Date(2026, 9, 1),
    workbenchDay: "2026-10-08",
    now,
  };

  it("日历选中 10 月 8 日导出当天及未安排任务，文件名带日历标签 + 选中日", () => {
    const tasks = [
      task({ id: "today", completedAt: null }),
      task({ id: "yesterday", scheduledDates: ["2026-10-07"], completedAt: null }),
      task({ id: "unscheduled", scheduledDates: ["2026-10-08"], startedAt: null, completedAt: null }),
    ];
    const result = selectTasksForExcel(tasks, { ...common, view: "calendar" });
    expect(result.tasks.map((item) => item.id)).toEqual(["today", "unscheduled"]);
    expect(result.tasks[1].scheduledDates).toEqual(["2026-10-08"]);
    expect(result.fileName).toBe("妥了任务_日历_2026-10-08_0130.xlsx");
  });

  it("日历与工作台导出选中日覆盖的跨天任务", () => {
    const span = task({ id: "span", scheduledDates: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],completedAt: null });
    expect(selectTasksForExcel([span], { ...common, view: "calendar" }).tasks.map((item) => item.id)).toEqual(["span"]);
    expect(selectTasksForExcel([span], { ...common, view: "workbench" }).tasks.map((item) => item.id)).toEqual(["span"]);
  });

  it("切月后不沿用已不可见的旧选中日", () => {
    const result = selectTasksForExcel([task({ scheduledDates: ["2026-10-08"], completedAt: null })], {
      ...common,
      view: "calendar",
      calendarDay: "2026-08-08",
    });
    expect(result.tasks).toHaveLength(1);
    expect(result.fileName).toBe("妥了任务_日历_2026-10_0130.xlsx");
  });

  it("工作台导出未安排、选中日进行中与当天完成的任务，文件名带工作台标签", () => {
    const tasks = [
      task({ id: "today", completedAt: null }),
      task({ id: "done-today", scheduledDates: ["2026-10-08"]}),
      task({ id: "overdue", scheduledDates: ["2026-10-07"], completedAt: null }),
      task({ id: "unscheduled", scheduledDates: ["2026-10-08"], startedAt: null, completedAt: null }),
    ];
    const result = selectTasksForExcel(tasks, { ...common, view: "workbench" });
    expect(result.tasks.map((item) => item.id)).toEqual(["unscheduled", "today", "done-today"]);
    expect(result.fileName).toBe("妥了任务_工作台_2026-10-08_0130.xlsx");
  });

  it("日历的日期范围同样按未安排任务的所属日匹配，搜索条件仍生效", () => {
    const tasks = [
      task({ id: "u1", title: "整理文件", scheduledDates: ["2026-10-08"], startedAt: null, completedAt: null }),
      task({ id: "u2", title: "购买用品", scheduledDates: ["2026-10-08"], startedAt: null, completedAt: null }),
    ];
    const result = selectTasksForExcel(tasks, {
      ...common,
      view: "calendar",
      filter: { ...EMPTY_FILTER, dateFrom: "2026-10-08", dateTo: "2026-10-08", keyword: "整理" },
    });
    expect(result.tasks.map((item) => item.id)).toEqual(["u1"]);
  });

  it("概览使用当前筛选，文件名按本地日期生成", () => {
    const tasks = [task({ id: "a", priority: "high" }), task({ id: "b", priority: "low" })];
    const result = selectTasksForExcel(tasks, {
      ...common,
      view: "all",
      filter: { ...EMPTY_FILTER, priorities: ["high"] },
    });
    expect(result.tasks.map((item) => item.id)).toEqual(["a"]);
    expect(result.fileName).toBe("妥了任务_概览_2026-10-08_0130.xlsx");
  });
});

describe("Excel 工作簿", () => {
  it("浏览器与桌面导出同样的列（含标签）、本地日期单元格和独立待办项表", () => {
    const source = [task()];
    const browser = buildTaskWorkbook(source);
    const desktop = XLSX.read(buildExcelBuffer(source), { type: "buffer" });

    for (const book of [browser, desktop]) {
      expect(book.SheetNames).toEqual(["任务", "待办项", "__妥了关联"]);
      expect(book.Workbook?.Sheets?.[2].Hidden).toBe(2);
      const main = book.Sheets["任务"];
      const rows = XLSX.utils.sheet_to_json<string[]>(main, { header: 1 });
      expect(rows[0]).toEqual(["序号", "标题", "备注", "标签", "分组", "优先级", "安排日期", "截止日期", "创建时间", "完成时间"]);
      expect(rows[1][3]).toBe("工作、复盘");
      expect(rows[1][4]).toBe("产品设计");
      expect(main["I2"].t).toBe("n");
      expect(main["J2"].t).toBe("n");
      expect(XLSX.utils.format_cell(main["I2"])).toBe("2026-10-08 01:19:34");
      expect(XLSX.utils.format_cell(main["J2"])).toBe("2026-10-08 01:19:34");
      expect(XLSX.utils.sheet_to_json(book.Sheets["待办项"])).toMatchObject([
        { 所属任务序号: 1, 待办项: "收集文件", 已完成: "是" },
        { 所属任务序号: 1, 待办项: "整理目录", 已完成: "否" },
      ]);
    }
  });

  it("新格式可导入并保留说明、标签、时间和待办项完成状态", () => {
    const source = task();
    const workbook = buildTaskWorkbook([source]);
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const parsed = parseTasksFromWorkbook(data);
    expect(parsed.skipped).toBe(0);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe(source.id);
    expect(parsed.tasks[0].note).toBe(source.note);
    expect(parsed.tasks[0].tags).toEqual(source.tags);
    expect(parsed.tasks[0].group).toBe(source.group);
    expect(parseTasksFromWorkbook(data).hasGroupColumn).toBe(true);
    expect(parsed.tasks[0].todos.map(({ title, done }) => ({ title, done }))).toEqual(
      source.todos.map(({ title, done }) => ({ title, done })),
    );
    expect(Math.abs(Date.parse(parsed.tasks[0].createdAt) - Date.parse(source.createdAt))).toBeLessThan(1000);
    expect(Math.abs(Date.parse(parsed.tasks[0].completedAt!) - Date.parse(source.completedAt!))).toBeLessThan(1000);
  });

  it("标签列支持逗号/顿号混写，一次解析多个并去重", () => {
    const sheet = XLSX.utils.json_to_sheet([{ 标题: "多标签", 标签: "工作,复盘、工作；学习" }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "任务");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    expect(parseTasksFromWorkbook(data).tasks[0].tags).toEqual(["工作", "复盘", "学习"]);
  });

  it("旧表的 ID、备注及单格待办项（旧列名「子任务」）仍可读取", () => {
    const sheet = XLSX.utils.json_to_sheet([{
      ID: "legacy-id",
      标题: "旧任务",
      备注: "旧说明",
      子任务: "[x] 第一项 | [ ] 第二项",
      创建时间: "2026-10-07T17:19:34.000Z",
    }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "任务");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const result = parseTasksFromWorkbook(data).tasks[0];
    expect(result.id).toBe("legacy-id");
    expect(result.note).toBe("旧说明");
    expect(result.tags).toEqual([]);
    expect(result.todos.map(({ title, done }) => ({ title, done }))).toEqual([
      { title: "第一项", done: true },
      { title: "第二项", done: false },
    ]);
  });

  it("旧版「子任务」命名的分表仍可读取（待办项改名前的导出文件兼容）", () => {
    const main = XLSX.utils.json_to_sheet([{ 序号: 1, 标题: "旧任务" }]);
    const subs = XLSX.utils.json_to_sheet([{ 所属任务序号: 1, 子任务: "旧表待办", 已完成: "是" }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, main, "任务");
    XLSX.utils.book_append_sheet(workbook, subs, "子任务");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const result = parseTasksFromWorkbook(data).tasks[0];
    expect(result.todos.map(({ title, done }) => ({ title, done }))).toEqual([
      { title: "旧表待办", done: true },
    ]);
  });

  it("hasTagsColumn/hasGroupColumn：新格式检出对应列，旧格式（无该列）为 false", () => {
    const newData = XLSX.write(buildTaskWorkbook([task()]), { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    expect(parseTasksFromWorkbook(newData).hasTagsColumn).toBe(true);
    expect(parseTasksFromWorkbook(newData).hasGroupColumn).toBe(true);
    const legacySheet = XLSX.utils.json_to_sheet([{ 标题: "旧任务" }]);
    const legacyBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(legacyBook, legacySheet, "任务");
    const legacyData = XLSX.write(legacyBook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    expect(parseTasksFromWorkbook(legacyData).hasTagsColumn).toBe(false);
    expect(parseTasksFromWorkbook(legacyData).hasGroupColumn).toBe(false);
  });

  it("更新匹配：文件缺「标签/分组」列时保留存量（旧导出兼容）；带列时空值 = 明确清空", () => {
    const existing = task({ id: "same", tags: ["购物"], group: "产品设计", completedAt: null });
    const incoming = task({ id: "same", title: "新标题", tags: [], group: null, completedAt: null });
    // 旧文件缺列：属「未提及」而非「清空」，保留存量
    const kept = planExcelImport([existing], [incoming], "update", {
      incomingHasTagsColumn: false,
      incomingHasGroupColumn: false,
    });
    expect(kept.tasks[0].title).toBe("新标题");
    expect(kept.tasks[0].tags).toEqual(["购物"]);
    expect(kept.tasks[0].group).toBe("产品设计");
    // 新文件带列且为空：按文件内容清空
    const cleared = planExcelImport([existing], [incoming], "update");
    expect(cleared.tasks[0].tags).toEqual([]);
    expect(cleared.tasks[0].group).toBeNull();
  });

  it("旧版无关联元数据的导出也能按标题和安排日匹配", () => {
    const existing = task({ id: "existing", completedAt: null });
    const incoming = task({ id: "fresh-import-id", completedAt: null });
    const merge = planExcelImport([existing], [incoming], "merge");
    expect(merge).toMatchObject({ added: 0, matched: 1, updated: 0 });
    expect(merge.tasks).toHaveLength(1);
    expect(merge.tasks[0].id).toBe("existing");
  });

  it("更新匹配任务只覆盖该任务，保留其他日期和未安排任务", () => {
    const existing = task({ id: "same", note: "旧说明", completedAt: null });
    const otherDay = task({ id: "other-day", title: "另一天", scheduledDates: ["2026-10-07"], completedAt: null });
    const unscheduled = task({ id: "unscheduled", title: "未安排", scheduledDates: [], completedAt: null });
    const imported = task({ id: "same", note: "新说明", completedAt: null });
    const result = planExcelImport([existing, otherDay, unscheduled], [imported], "update");
    expect(result).toMatchObject({ added: 0, matched: 1, updated: 1 });
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks.find((item) => item.id === "same")?.note).toBe("新说明");
    expect(result.tasks.find((item) => item.id === "other-day")).toEqual(otherDay);
    expect(result.tasks.find((item) => item.id === "unscheduled")).toEqual(unscheduled);
  });

  it("关联元数据能在标题被编辑后继续匹配原任务", () => {
    const existing = task({ id: "same", title: "旧标题", completedAt: null });
    const imported = task({ id: "same", title: "新标题", completedAt: null });
    const result = planExcelImport([existing], [imported], "update");
    expect(result).toMatchObject({ added: 0, matched: 1, updated: 1 });
    expect(result.tasks[0].title).toBe("新标题");
  });

  it("文件里重复出现的同一任务只处理一次", () => {
    const existing = task({ id: "same", completedAt: null });
    const result = planExcelImport([existing], [existing, existing], "merge");
    expect(result).toMatchObject({ added: 0, matched: 1, ambiguous: 1 });
    expect(result.tasks).toHaveLength(1);
  });

  it("无关联元数据且同名同日但时间冲突时跳过，避免误覆盖", () => {
    const existing = task({ id: "existing", completedAt: null });
    const incoming = task({
      id: "new-import-id",
      note: "不同内容",
      createdAt: new Date(2026, 9, 9, 1, 19, 34).toISOString(),
      completedAt: null,
    });
    const result = planExcelImport([existing], [incoming], "update");
    expect(result).toMatchObject({ added: 0, matched: 0, updated: 0, ambiguous: 1 });
    expect(result.tasks).toEqual([existing]);
  });
});

describe("备忘 Excel（2026-10-18）", () => {
  const note = (over: Partial<NoteItem> = {}): NoteItem => ({
    id: "note-1",
    title: "学滑雪",
    note: "等冬天旺季再看教练和价格",
    createdAt: localMorning.toISOString(),
    ...over,
  });

  it("浏览器与桌面导出同构：备忘表列头、数值日期单元格、隐藏关联表", () => {
    const source = [note(), note({ id: "note-2", title: "读《格局》", note: "" })];
    const browser = buildNotesWorkbook(source);
    const desktop = XLSX.read(buildNotesExcelBuffer(source), { type: "buffer" });

    for (const book of [browser, desktop]) {
      expect(book.SheetNames).toEqual(["备忘", "__妥了关联"]);
      expect(book.Workbook?.Sheets?.[1].Hidden).toBe(2);
      const main = book.Sheets["备忘"];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(main, { header: 1 });
      expect(rows[0]).toEqual(["序号", "标题", "备注", "创建时间"]);
      expect(rows[1][1]).toBe("学滑雪");
      expect(rows[1][2]).toBe("等冬天旺季再看教练和价格");
      // 创建时间 = 数值日期单元格（本地墙上时间往返，与任务表同工艺）
      expect(main["D2"].t).toBe("n");
      expect(XLSX.utils.format_cell(main["D2"])).toBe("2026-10-08 01:19:34");
      expect(XLSX.utils.sheet_to_json(book.Sheets["__妥了关联"])).toMatchObject([
        { 序号: 1, 关联: "note-1" },
        { 序号: 2, 关联: "note-2" },
      ]);
    }
  });

  it("导出 → 解析往返：id/标题/备注保留，创建时间本地墙上时间无损", () => {
    const source = [note()];
    const data = XLSX.write(buildNotesWorkbook(source), { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const parsed = parseNotesFromWorkbook(data);
    expect(parsed.skipped).toBe(0);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0].id).toBe("note-1");
    expect(parsed.notes[0].title).toBe("学滑雪");
    expect(parsed.notes[0].note).toBe("等冬天旺季再看教练和价格");
    expect(Math.abs(Date.parse(parsed.notes[0].createdAt) - Date.parse(source[0].createdAt))).toBeLessThan(1000);
  });

  it("手工文件（无「备忘」表名/无关联表）回落首表解析：新 id、缺创建时间补基准时刻、空标题跳过计数", () => {
    const sheet = XLSX.utils.json_to_sheet([
      { 标题: "手记的备忘", 备注: "说明" },
      { 备注: "这行没有标题" },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const parsed = parseNotesFromWorkbook(data);
    expect(parsed.skipped).toBe(1);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0].title).toBe("手记的备忘");
    expect(parsed.notes[0].note).toBe("说明");
    expect(parsed.notes[0].id).not.toBe("note-1");
    expect(Number.isNaN(Date.parse(parsed.notes[0].createdAt))).toBe(false);
  });

  it("导出范围 = 搜索 + 记于单日锚点后的可见列表，文件名带备忘标签与时刻", () => {
    const now = new Date(2026, 9, 8, 1, 30);
    // 本地时间构造时间戳：任何时区下「本地日」恒定，测试不随运行环境 TZ 漂移
    const notes = [
      note({ id: "in", title: "学滑雪", createdAt: new Date(2026, 9, 8, 9, 19, 34).toISOString() }),
      note({ id: "out-day", title: "旧日滑雪备忘", createdAt: new Date(2026, 9, 7, 9, 19, 34).toISOString() }),
      note({ id: "out-keyword", title: "读《格局》", createdAt: new Date(2026, 9, 8, 9, 19, 34).toISOString() }),
    ];
    const result = selectNotesForExcel(notes, {
      filter: { ...EMPTY_FILTER, keyword: "滑雪" },
      notesDay: "2026-10-08",
      now,
    });
    expect(result.notes.map((item) => item.id)).toEqual(["in"]);
    expect(result.fileName).toBe("妥了备忘_2026-10-08_0130.xlsx");
    // notesDay = null（全部日期）时只受关键词约束
    const all = selectNotesForExcel(notes, { filter: { ...EMPTY_FILTER, keyword: "滑雪" }, notesDay: null, now });
    expect(all.notes.map((item) => item.id)).toEqual(["in", "out-day"]);
  });
});

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildTaskWorkbook, parseTasksFromWorkbook } from "../src/lib/excel";
import { selectTasksForExcel } from "../src/lib/excelScope";
import { planExcelImport } from "../src/shared/excelImport";
import { EMPTY_FILTER } from "../src/shared/filter";
import type { Task } from "../src/shared/types";

const require = createRequire(import.meta.url);
const { buildExcelBuffer } = require("../electron/excel.cjs") as {
  buildExcelBuffer: (tasks: Task[]) => Buffer;
};

const localMorning = new Date(2026, 9, 8, 1, 19, 34);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    title: "整理资料",
    note: "核对内容",
    priority: "medium",
    scheduledDate: "2026-10-08",
    dueDate: null,
    subtasks: [
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
      task({ id: "yesterday", scheduledDate: "2026-10-07", completedAt: null }),
      task({ id: "unscheduled", scheduledDate: null, completedAt: null }),
    ];
    const result = selectTasksForExcel(tasks, { ...common, view: "calendar" });
    expect(result.tasks.map((item) => item.id)).toEqual(["today", "unscheduled"]);
    expect(result.tasks[1].scheduledDate).toBeNull();
    expect(result.fileName).toBe("妥了任务_日历_2026-10-08_0130.xlsx");
  });

  it("日历与工作台导出选中日覆盖的跨天任务", () => {
    const span = task({ id: "span", scheduledDate: "2026-10-05", dueDate: "2026-10-09", completedAt: null });
    expect(selectTasksForExcel([span], { ...common, view: "calendar" }).tasks.map((item) => item.id)).toEqual(["span"]);
    expect(selectTasksForExcel([span], { ...common, view: "workbench" }).tasks.map((item) => item.id)).toEqual(["span"]);
  });

  it("切月后不沿用已不可见的旧选中日", () => {
    const result = selectTasksForExcel([task({ scheduledDate: "2026-10-08", completedAt: null })], {
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
      task({ id: "done-today", scheduledDate: "2026-10-07" }),
      task({ id: "overdue", scheduledDate: "2026-10-07", completedAt: null }),
      task({ id: "unscheduled", scheduledDate: null, completedAt: null }),
    ];
    const result = selectTasksForExcel(tasks, { ...common, view: "workbench" });
    expect(result.tasks.map((item) => item.id)).toEqual(["unscheduled", "today", "done-today"]);
    expect(result.fileName).toBe("妥了任务_工作台_2026-10-08_0130.xlsx");
  });

  it("日历的日期范围不会排除未安排任务，搜索条件仍生效", () => {
    const tasks = [
      task({ id: "u1", title: "整理文件", scheduledDate: null, completedAt: null }),
      task({ id: "u2", title: "购买用品", scheduledDate: null, completedAt: null }),
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
  it("浏览器与桌面导出同样的列、本地日期单元格和独立子任务表", () => {
    const source = [task()];
    const browser = buildTaskWorkbook(source);
    const desktop = XLSX.read(buildExcelBuffer(source), { type: "buffer" });

    for (const book of [browser, desktop]) {
      expect(book.SheetNames).toEqual(["任务", "子任务", "__妥了关联"]);
      expect(book.Workbook?.Sheets?.[2].Hidden).toBe(2);
      const main = book.Sheets["任务"];
      const headers = XLSX.utils.sheet_to_json<string[]>(main, { header: 1 })[0];
      expect(headers).toEqual(["序号", "标题", "说明", "优先级", "安排日期", "截止日期", "创建时间", "完成时间"]);
      expect(main["G2"].t).toBe("n");
      expect(main["H2"].t).toBe("n");
      expect(XLSX.utils.format_cell(main["G2"])).toBe("2026-10-08 01:19:34");
      expect(XLSX.utils.format_cell(main["H2"])).toBe("2026-10-08 01:19:34");
      expect(XLSX.utils.sheet_to_json(book.Sheets["子任务"])).toMatchObject([
        { 所属任务序号: 1, 子任务: "收集文件", 已完成: "是" },
        { 所属任务序号: 1, 子任务: "整理目录", 已完成: "否" },
      ]);
    }
  });

  it("新格式可导入并保留说明、时间和子任务完成状态", () => {
    const source = task();
    const workbook = buildTaskWorkbook([source]);
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const parsed = parseTasksFromWorkbook(data);
    expect(parsed.skipped).toBe(0);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe(source.id);
    expect(parsed.tasks[0].note).toBe(source.note);
    expect(parsed.tasks[0].subtasks.map(({ title, done }) => ({ title, done }))).toEqual(
      source.subtasks.map(({ title, done }) => ({ title, done })),
    );
    expect(Math.abs(Date.parse(parsed.tasks[0].createdAt) - Date.parse(source.createdAt))).toBeLessThan(1000);
    expect(Math.abs(Date.parse(parsed.tasks[0].completedAt!) - Date.parse(source.completedAt!))).toBeLessThan(1000);
  });

  it("旧表的 ID、备注及单格子任务仍可读取", () => {
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
    expect(result.subtasks.map(({ title, done }) => ({ title, done }))).toEqual([
      { title: "第一项", done: true },
      { title: "第二项", done: false },
    ]);
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
    const otherDay = task({ id: "other-day", title: "另一天", scheduledDate: "2026-10-07", completedAt: null });
    const unscheduled = task({ id: "unscheduled", title: "未安排", scheduledDate: null, completedAt: null });
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

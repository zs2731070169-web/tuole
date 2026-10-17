// filterNotes 纯函数（备忘池的关键词过滤）：镜像任务搜索 matchKeyword 的口径——
// 空/纯空白关键词不过滤（原引用返回），否则标题或备注大小写不敏感 contains 命中即保留；
// filterNotesByCreatedRange（记于日期闭区间）与 planNotesImport（导入只添加新的去重规划）
import { describe, expect, it } from "vitest";
import { filterNotes, filterNotesByCreatedRange, planNotesImport } from "../src/shared/notes";
import type { NoteItem } from "../src/shared/types";

const demoNote = (over: Partial<NoteItem>): NoteItem => ({
  id: "n1",
  title: "学滑雪",
  note: "等冬天旺季再看教练和价格",
  createdAt: "2026-10-18T08:00:00.000Z",
  ...over,
});

describe("filterNotes（备忘关键词过滤）", () => {
  const notes = [
    demoNote({ id: "a", title: "学滑雪", note: "等冬天旺季再看教练和价格" }),
    demoNote({ id: "b", title: "读《格局》", note: "" }),
    demoNote({ id: "c", title: "整理相册", note: "SKI TRIP 2025 的照片" }),
  ];

  it("空关键词与纯空白关键词返回原数组引用（不过滤）", () => {
    expect(filterNotes(notes, "")).toBe(notes);
    expect(filterNotes(notes, "   ")).toBe(notes);
  });

  it("标题命中（大小写不敏感）", () => {
    expect(filterNotes(notes, "滑雪").map((n) => n.id)).toEqual(["a"]);
    expect(filterNotes(notes, "格局").map((n) => n.id)).toEqual(["b"]);
  });

  it("备注命中（大小写不敏感）", () => {
    expect(filterNotes(notes, "教练").map((n) => n.id)).toEqual(["a"]);
    expect(filterNotes(notes, "ski trip").map((n) => n.id)).toEqual(["c"]);
  });

  it("无命中返回空数组；空备注的条目不因空查询串误命中", () => {
    expect(filterNotes(notes, "不存在的内容")).toEqual([]);
    expect(filterNotes([notes[1]!], "不存在的")).toEqual([]);
  });
});

describe("filterNotesByCreatedRange（记于日期范围，闭区间，本地日键）", () => {
  // 用本地时间构造器生成时间戳（与 excel.test.ts 的 localMorning 同法）：任何时区下
  // 「本地日」都恒定，测试不随运行环境 TZ 漂移
  const notes = [
    demoNote({ id: "a", createdAt: new Date(2026, 9, 1, 16, 0, 0).toISOString() }), // 本地 10-01
    demoNote({ id: "b", createdAt: new Date(2026, 9, 19, 7, 59, 59).toISOString() }), // 本地 10-19
    demoNote({ id: "c", createdAt: new Date(2026, 9, 31, 23, 0, 0).toISOString() }), // 本地 10-31
  ];

  it("双边界皆空 = 未启用（原引用返回）；单边界有效", () => {
    expect(filterNotesByCreatedRange(notes, null, null)).toBe(notes);
    expect(filterNotesByCreatedRange(notes, "2026-10-19", null).map((n) => n.id)).toEqual(["b", "c"]);
    expect(filterNotesByCreatedRange(notes, null, "2026-10-18").map((n) => n.id)).toEqual(["a"]);
  });

  it("闭区间含两端；时间戳非法的条目视为不在任何范围内", () => {
    expect(filterNotesByCreatedRange(notes, "2026-10-01", "2026-10-31").map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(filterNotesByCreatedRange(notes, "2026-10-01", "2026-10-18").map((n) => n.id)).toEqual(["a"]);
    const broken = [demoNote({ id: "bad", createdAt: "not-a-date" })];
    expect(filterNotesByCreatedRange(broken, "2000-01-01", "2099-12-31")).toEqual([]);
  });

  it("凌晨记录归其本地日（审查修复回归锚：UTC 日键在 UTC+ 时区会把 00:00-07:59 错位到前一天）", () => {
    const dawn = [demoNote({ id: "dawn", createdAt: new Date(2026, 9, 18, 0, 30, 0).toISOString() })];
    expect(filterNotesByCreatedRange(dawn, "2026-10-18", "2026-10-18").map((n) => n.id)).toEqual(["dawn"]);
    expect(filterNotesByCreatedRange(dawn, "2026-10-17", "2026-10-17")).toEqual([]);
  });
});

describe("planNotesImport（导入只添加新的去重规划）", () => {
  const existing = [demoNote({ id: "e1", title: "学滑雪", createdAt: "2026-10-18T08:00:00.000Z" })];

  it("id 精确命中与 标题+创建时间 fallback 命中都跳过；全新条目进入 added", () => {
    const incoming = [
      demoNote({ id: "e1", title: "改了标题", createdAt: "2026-10-18T09:00:00.000Z" }), // id 命中
      demoNote({ id: "n1", title: "学滑雪", createdAt: "2026-10-18T08:00:00.000Z" }), // 标题+时间命中
      demoNote({ id: "n2", title: "读《格局》", createdAt: "2026-10-17T08:00:00.000Z" }), // 全新
    ];
    const plan = planNotesImport(existing, incoming);
    expect(plan.added.map((n) => n.id)).toEqual(["n2"]);
    expect(plan.existed).toBe(2);
  });

  it("文件内部重复同样跳过（后出现的视为已存在）", () => {
    const incoming = [
      demoNote({ id: "n1", title: "读《格局》", createdAt: "2026-10-17T08:00:00.000Z" }),
      demoNote({ id: "n2", title: "读《格局》", createdAt: "2026-10-17T08:00:00.000Z" }), // 同标题同时间
      demoNote({ id: "n1", title: "另一个标题", createdAt: "2026-10-16T08:00:00.000Z" }), // 同 id
    ];
    const plan = planNotesImport([], incoming);
    expect(plan.added.map((n) => n.id)).toEqual(["n1"]);
    expect(plan.existed).toBe(2);
  });
});

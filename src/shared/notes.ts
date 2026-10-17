// 备忘纯函数：无 React 依赖，被 tests/ 直接覆盖
import { toDateKey } from "../lib/date";
import type { NoteItem } from "./types";

/** 关键词过滤（镜像 filter.ts 的 matchKeyword 口径）：空/纯空白关键词原引用返回；
 *  否则标题或备注大小写不敏感 contains 命中即保留 */
export function filterNotes(notes: NoteItem[], keyword: string): NoteItem[] {
  if (!keyword.trim()) return notes;
  const q = keyword.trim().toLowerCase();
  return notes.filter((n) => n.title.toLowerCase().includes(q) || n.note.toLowerCase().includes(q));
}

/** 记于日期范围过滤（2026-10-18 用户要求：备忘工具行补日期筛选；备忘无安排日期，
 *  唯一时间锚 = createdAt「记于」）：折算**本地日键**（toDateKey，与卡片「记于」标签、
 *  DateRangeField 提交的边界、Excel 日期单元格同口径——审查修复：勿用 toISOString
 *  的 UTC 日键，UTC+ 时区凌晨记录会错位一天）后按闭区间比较，单边界有效，
 *  双边界皆空 = 未启用（原引用返回）；时间戳非法的条目视为不在任何范围内 */
export function filterNotesByCreatedRange(notes: NoteItem[], from: string | null, to: string | null): NoteItem[] {
  if (!from && !to) return notes;
  return notes.filter((n) => {
    const created = new Date(n.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    const key = toDateKey(created);
    if (from && key < from) return false;
    if (to && key > to) return false;
    return true;
  });
}

export interface NotesImportPlan {
  added: NoteItem[]; // 去重后真正新增的条目
  existed: number; // 命中存量（或文件内重复）被跳过的条目数
}

/** 备忘导入去重规划（只添加新，无「更新匹配」模式——v1 明确边界）：
 *  命中判定 = id 精确匹配（隐藏关联表往返）或 标题+创建时间 完全一致（fallback）；
 *  文件内部重复同样跳过（后出现的视为已存在） */
export function planNotesImport(existing: NoteItem[], incoming: NoteItem[]): NotesImportPlan {
  const existingIds = new Set(existing.map((n) => n.id));
  const existingKeys = new Set(existing.map((n) => `${n.title}__${n.createdAt}`));
  const added: NoteItem[] = [];
  let existed = 0;
  for (const note of incoming) {
    const key = `${note.title}__${note.createdAt}`;
    if (existingIds.has(note.id) || existingKeys.has(key)) {
      existed++;
      continue;
    }
    added.push(note);
    // 登记进命中集：文件内后续重复行按已存在跳过
    existingIds.add(note.id);
    existingKeys.add(key);
  }
  return { added, existed };
}

# 备忘模块迭代：日期选择与 Excel、转正取消自动跳转

## Why

用户使用反馈（2026-10-18，备忘模块上线同日三轮定调）：① 备忘视图缺「日期选择」与「导入/导出」，要求补上——**日期选择最终口径（第三轮）：放工具行左上角 leading 槽、单日选择，不用范围日期胶囊**（第一轮曾按 DateRangeInlineFilter 范围胶囊实现，被用户否决）；② 「转为任务」后自动打开任务编辑抽屉 = 从备忘被拽进任务编辑上下文，用户不要这个自动跳转。

## What Changes

- **行首单日选择器（终版口径）**：`NotesDayPicker`（`src/features/notes/NotesView.tsx` 导出，渲染在 ViewToolbar leading 槽，与 WorkbenchDayPicker 同范式）——`SchedulePopover`（今天快捷 + 单选日历、选择即关）扩展可选「清除」快捷项（`onClear`/`clearLabel`，既有调用方零影响）。状态 = `useUiStore.notesDay: string | null`（null = 全部日期 = 默认态，不持久化、与 workbenchDay 同纪律）。筛选语义 = 只看**记于（createdAt）该日**的备忘，`filterNotesByCreatedRange(notes, day, day)` 同日闭区间；**日键口径 = `toDateKey` 本地日**（审查修复：首轮实现误用 `toISOString` 的 UTC 日键，UTC+ 时区凌晨记录会与「记于」标签/筛选边界错位一天——标签、DateRangeField 边界、Excel 日期单元格全走本地日）。`DateRangeInlineFilter` 不进备忘视图（恢复 `view === "calendar"` 门控）。
- **备忘 Excel 导入/导出（双端同构）**：
  - **导出**：范围 = 搜索关键词 + 记于单日锚点后的**可见列表**（`excelScope.selectNotesForExcel(notes, {filter, notesDay, now})`）；文件名 `妥了备忘_{当天}_{HHmm}.xlsx`。工作簿 = 「备忘」表（序号/标题/备注/创建时间数值日期单元格）+ 隐藏 `__妥了关联` 表（序号→id）；浏览器 `excel.ts` 的 `buildNotesWorkbook`/`exportNotesToXlsx`/`parseNotesFromWorkbook`、桌面 `excel.cjs` 的 `buildNotesExcelBuffer` 双端同构。
  - **导入**：解析优先取「备忘」表、回落首表（手工文件）；标题必填否则跳过计数、创建时间缺失补基准时刻、隐藏关联表回填 id。**只添加新**——`planNotesImport(existing, incoming)` 去重（id 精确 + 标题+创建时间 fallback、文件内自去重），重复导入幂等；**无「更新匹配」模式**（v1 明确边界）。store 动作 `useNoteStore.importNotes`。
  - **桌面通道**：复用 `tuole:excel:export` IPC，载荷 `kind: "notes"` 分流工作簿构造器（preload 透传 options 天然兼容、不开新通道）；`DesktopExcelOptions` 加 `kind?`、桥函数行类型放宽 `Task[] | NoteItem[]`；导入复用 `tuole:excel:import`。
  - **UI**：`src/components/NoteIOButtons.tsx`（TaskIOButtons 同款外壳 + 单动作导入弹窗）；`ViewToolbar` IO 位在备忘视图分流到它。
- **转为任务取消自动跳转（2026-10-18 用户决策）**：`handleConvert` 不再 `openEditor`——转正后**留在备忘视图**（备忘行消失即反馈），toast 指明去向（`notes.convertedToast`）；store 的 `convertNoteToTask` 语义不变。

## 不改动 / 红线

- 备忘仍不参与任务状态机/任务筛选（applyFilters）/概览统计/任务 Excel 表/自动备份/提醒；本次的 Excel 是**备忘自己的表**，与任务表互不相干。
- 备忘导入无「更新匹配」、无替换导入；重复导入同文件 = 幂等。
- **勿给备忘加回范围日期胶囊**（用户第三轮明确否决）；优先级筛选仍不进备忘视图；新建/搜索/刷新口径不变。
- `convertNoteToTask` store 语义、转正任务口径（`scheduledDates:[今天] + startedAt:null`）不变。
- 搜索关键词为全局共享筛选态，跨视图遗留沿用既有行为；`notesDay` 是备忘专属锚点、不影响其他视图。

## Impact

- 修改：`src/shared/notes.ts`、`src/lib/excel.ts`、`src/lib/excelScope.ts`、`src/lib/desktopBridge.ts`、`src/lib/i18n.ts`、`src/stores/useNoteStore.ts`、`src/stores/useUiStore.ts`（notesDay）、`src/components/ViewToolbar.tsx`、`src/components/SchedulePopover.tsx`（onClear 扩展）、`src/features/notes/NotesView.tsx`（NotesDayPicker + 派生）、`src/routes/index.tsx`（leading 槽）、`electron/excel.cjs`、`electron/main.cjs`、AGENTS.md；测试 `tests/notes.test.ts`、`tests/excel.test.ts`、`tests/noteStore.test.ts`。
- 新文件：`src/components/NoteIOButtons.tsx`。
- 桌面打包版需重跑 `pnpm desktop:dist`（excel.cjs/main.cjs 改动）。

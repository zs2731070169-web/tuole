# Tasks

- [x] 1. 纯函数：`filterNotesByCreatedRange`（记于**本地日键**闭区间——审查修复 UTC 错位）+ `planNotesImport`（id 精确 + 标题+创建时间去重、文件内自去重）+ 单测（含凌晨记录归本地日回归锚）
- [x] 2. 浏览器 Excel：`buildNotesWorkbook` / `exportNotesToXlsx` / `parseNotesFromWorkbook`（备忘表 + 隐藏关联表往返）
- [x] 3. 桌面同构：`excel.cjs` `buildNotesExcelBuffer`；`main.cjs` 导出 IPC 按 `kind` 分流；`desktopBridge.ts` `DesktopExcelOptions.kind` + 行类型放宽
- [x] 4. 导出范围：`excelScope.selectNotesForExcel`（搜索 + 记于单日锚点 + 文件名）
- [x] 5. store：`useNoteStore.importNotes`（planNotesImport 落库写透，返回新增/跳过计数）+ 单测
- [x] 6. 行首单日选择器：`SchedulePopover` 加 onClear/clearLabel；uiStore `notesDay`/`setNotesDay`；`NotesDayPicker` + routes leading 槽接线；`DateRangeInlineFilter` 恢复 calendar-only（用户第三轮定调：不用范围胶囊）
- [x] 7. UI：`NoteIOButtons`（导入预览单动作弹窗）+ `ViewToolbar` IO 分流 + `NotesView` 转正去 openEditor 改 toast
- [x] 8. i18n：`notes.io.*` + `notes.convertedToast` + `notes.allDates`/`notes.dayPickerHint`
- [x] 9. 测试：notes（range + plan + 本地日键）、excel（备忘往返 + 桌面 buffer 解析 + 单日导出范围）、noteStore（importNotes）
- [x] 10. `pnpm typecheck` + `pnpm test`（多时区）+ `pnpm build` 全绿；AGENTS.md 备忘条目更新；归档本 change

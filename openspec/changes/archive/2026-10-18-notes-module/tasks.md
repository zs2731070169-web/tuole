# Tasks

- [x] 1. 契约：`NoteItem` 类型 + `VIEW_MODES` 加 `"notes"` + `STORAGE_KEYS.notes`
- [x] 2. 持久化：storage.ts `sanitizeNoteEntry`/`loadNotes`/`saveNotes` + `STORAGE_FILES` 映射 + `DesktopStorageFile` 联合类型 + main.cjs IPC 白名单（三处同批）
- [x] 3. 纯函数 `src/shared/notes.ts` `filterNotes` + 单测（tests/notes.test.ts）
- [x] 4. `useNoteStore`（init/persist/createNote/updateNote/deleteNote/convertNoteToTask）+ 单测（tests/noteStore.test.ts）
- [x] 5. uiStore `noteEditor` 状态 + `openNoteEditor`/`closeNoteEditor` + 单测（tests/uiStore.test.ts 扩展）
- [x] 6. RowButton 抽取至 `src/components/RowButton.tsx`，TaskItem 改 import（零行为差异）
- [x] 7. i18n `notes.*` 8 键（zh/en）
- [x] 8. 接线：TopBar 第 4 标签、ViewToolbar 四处条件 + `NewNoteButton`、routes 启动 `initNotes` / `onRefresh` / `NotesView` 分支 / `NotesEditor` 挂载
- [x] 9. `NotesView`（卡片列表 + 悬停操作行 + 空态）与 `NotesEditor`（全缓冲抽屉、标题必填、备注自动伸缩、无草稿）
- [x] 10. `tests/storage.test.ts` 扩展：loadNotes/saveNotes 浏览器往返 + 桌面 notes.json 分支 + notes 视图持久化往返
- [x] 11. 验证：`pnpm typecheck` + `pnpm test`（263 全绿）+ `pnpm build` 通过；实现后必审（对抗式审查工作流）确认并修复操作行键盘不可达（标题改按钮 = 编辑入口 + 焦点锚）；`pnpm dev` 视觉冒烟（CRUD/转任务/搜索/双语/刷新）留待用户在 3015 端口复核
- [x] 12. AGENTS.md：四视图条目、RowButton 共享位置、备忘模块红线条目 + 三处旧「三视图」措辞更新；CLAUDE.md 目录清单同步；归档本 change

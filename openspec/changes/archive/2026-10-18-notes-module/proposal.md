# 备忘模块：不确定何时做的任务暂存池（第 4 视图）

## Why

用户需求（2026-10-18）：需要一个地方记录「未来某一天可能会安排、但现在还不确定」的任务——塞进任务列表会污染按日组织的视图与统计，不记则会丢。经确认的三项决策：① 模块名 **备忘**（en: Notes），第 4 个视图标签（工作台之后）；② 字段最小集 = **标题（必填）+ 备注（选填）**，无分组/标签/优先级/日期；③ 每条备忘提供**「转为任务」**动作。

## What Changes

- **独立实体 `NoteItem`**（`src/shared/types.ts`：`{ id, title, note, createdAt, updatedAt? }`）+ 独立持久化：localStorage `todo.notes.v1` / 桌面 `~/.tuole/notes.json`（主进程 IPC 白名单 Set +1，`STORAGE_FILES` 映射 + `DesktopStorageFile` 联合类型同步扩展）。独立实体而非复用 Task：复用需改状态机/工作台/日历/概览/Excel/提醒全链路，爆炸半径不可接受。
- **`useNoteStore`**（`src/stores/useNoteStore.ts`，镜像 useTaskStore 形状）：`init`/`persist` 写透 + `createNote`（前插，最新在前）/ `updateNote` / `deleteNote` / **`convertNoteToTask(id)`**——跨 store 单向调用 `useTaskStore.createTask({ title, note, scheduledDates: [todayKey()], startedAt: null, parkedDate: null })`（与工具行「新建任务」的「未安排停靠今天」口径完全同构）→ 删备忘 → 返回任务。
- **视图接线**：`VIEW_MODES` + `"notes"`（类型与 loadUiState 校验自动跟进）；TopBar `VIEWS` 第 4 标签（StickyNote 图标，展示顺序 概览/日历/工作台/备忘）；`routes/index.tsx` 启动 effect 加 `initNotes()`、`onRefresh` 同步、渲染分支 `{view === "notes" && <NotesView />}`、应用级挂载 `{noteEditor && <NotesEditor />}`。
- **ViewToolbar 备忘口径** = 新建备忘（局部 `NewNoteButton`，打开备忘编辑抽屉）+ 搜索（复用全局关键词，`filterNotes` 按 title/note contains 过滤）+ 刷新；隐藏优先级筛选（收窄为 `view === "workbench"`）、日期筛选（收窄为 `view === "calendar"`）、Excel 导入导出（任务域）。
- **`NotesView`**（`src/features/notes/`）：全宽单列卡片（标题 truncate + 备忘预览 line-clamp-2 + 「记于 {日期}」尾行走 `absoluteDateLabel`），卡下悬停操作行（TaskItem 同款 idiom，共享 `RowButton`）：转为任务（ListTodo）/ 编辑（Pencil）/ 删除（Trash2 + `useConfirmStore` 危险确认）；空态 = EmptyLine 同款虚线占位。
- **`NotesEditor`**：TaskEditor 同款全缓冲抽屉（`top-[69px]` 遮罩纯视觉、关闭唯一入口 ×、标题必填行内校验、备注自动伸缩 textarea）；**无草稿机制**——备忘创建零副作用，create 到保存前零持久化，× 直接丢弃（与任务 draft 机制刻意不同）。
- **`RowButton` 抽取**：自 `TaskItem.tsx` 原样搬到 `src/components/RowButton.tsx`（含 forwardRef + rest 透传给 `PopoverTrigger asChild` 的契约注释），TaskItem 改 import，零行为差异。
- **转为任务的用户路径**：点「转为任务」→ TaskEditor 叠在备忘视图上自动打开（不切视图、无 toast——抽屉打开即反馈）；关闭抽屉后任务在工作台今天「未安排」栏可见、备忘从列表消失。
- **i18n**：`notes.*` 新增 8 键（zh/en），标签字段/保存/必填提示/搜索占位复用既有键。

## 不改动 / 红线

- **备忘永不参与**：任务状态机、状态/优先级/日期筛选（applyFilters 口径）、概览统计、Excel 导入导出、自动备份与恢复、桌面提醒。备份快照仍是任务作用域（备忘不进快照 = 已知限制，v1 明确不修）。
- 无分组/标签/优先级/日期字段；无拖拽排序（createdAt 降序固定）；无分页；无行内快捷新建（工具行「新建」→ 抽屉）。
- 删除一律 `useConfirmStore.ask` 危险确认，禁 `window.confirm`；编辑抽屉关闭唯一入口 = 右上角 ×（遮罩不响应点击）、标题必填。
- 搜索关键词为全局共享：从其他视图带着关键词切到备忘会连带过滤备忘，与既有跨视图行为一致，不为此改筛选语义。
- 任务的 draft 机制、选中/勾选通道（selectedIds/checkedIds）、SelectionBar 均与备忘无关——备忘卡片不挂 `task-item` 类、不可拖拽、无勾选框。
- 主进程提醒联动按文件名判定（仅 settings.json/tasks.json 触发 check），notes.json 落盘不触发提醒检查。

## Impact

- 新文件：`src/shared/notes.ts`、`src/stores/useNoteStore.ts`、`src/components/RowButton.tsx`、`src/features/notes/NotesView.tsx`、`src/features/notes/NotesEditor.tsx`、`tests/notes.test.ts`、`tests/noteStore.test.ts`。
- 修改：`src/shared/types.ts`、`src/shared/constants.ts`、`src/lib/storage.ts`、`src/lib/desktopBridge.ts`、`electron/main.cjs`（白名单 +1）、`src/stores/useUiStore.ts`、`src/components/TaskItem.tsx`（RowButton 改 import）、`src/lib/i18n.ts`、`src/components/TopBar.tsx`、`src/components/ViewToolbar.tsx`、`src/routes/index.tsx`、`tests/storage.test.ts`、`tests/uiStore.test.ts`、AGENTS.md。
- 桌面打包版必须重跑 `pnpm desktop:dist` 才带白名单改动。

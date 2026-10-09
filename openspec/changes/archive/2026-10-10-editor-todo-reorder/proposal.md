# 编辑抽屉待办项拖拽排序

## Why

用户反馈（2026-10-10，截屏 01.25.11）：新增/编辑抽屉的待办项只能按添加顺序排列，希望前后之间的顺序也可以**拖拽调整**。

## What Changes

- `TaskEditor` 待办项列表支持**行内拖拽排序**：每行行首新增 GripVertical 拖拽手柄（常显、muted 弱化），HTML5 原生拖拽，专用载荷 `text/todo-row-id`——不复用 `text/task-id`，与任务卡/日历 chip 的拖拽契约完全隔离。
- 手柄沿用全库防光标闪烁纪律：静息 `draggable=false`，pointerdown 武装、pointerup/pointercancel/dragend 复位；拖影（setDragImage）= 整行快照而非小图标。
- 放置判定挂在**列表容器**上，与工作台栏内排序（`makeListReorderHandlers`）同构：按 `[data-todo-row]` 几何中点算插入位，首行上方/尾行下方/行间隙皆可放，插入边界画亮蓝指示线（`status-today`）；dragleave 带 `relatedTarget` 容器内守卫防行间移动指示线闪烁；被拖源行降透明（opacity-40）反馈。
- **全缓冲语义不变**：重排只动本地 `todos` 缓冲数组，随「保存」整段落库（`commitAndClose` 已按缓冲数组顺序提交，无需改提交链）；× 关闭 = 放弃重排。切换编辑对象时拖拽态随缓冲区一并复位。
- 重排逻辑收敛为纯函数 `moveTodoItem(todos, todoId, targetIndex)`（`src/shared/todos.ts`，目标位按「移除源项后的数组」计，越界钳制、未知 id 原样返回），`tests/todos.test.ts` 锚定；不落库、不改 store 动作。
- i18n：新增 `editor.todoDragHandle`（手柄 aria-label）；`editor.todoTickHint` 提示补「拖动行首手柄可调整顺序」。

## Impact

- 文件：`src/features/tasks/TaskEditor.tsx`、`src/shared/todos.ts`（新增）、`src/lib/i18n.ts`、`tests/todos.test.ts`（新增）、AGENTS.md 待办项条目补口径。
- 纯展示层 + 缓冲区内部重排：无数据契约改动（`Task.todos` 数组序即展示序，落库/Excel 往返/TodoPanel 均按数组序，天然承接）；保存前零 store 写入。
- 触屏无 HTML5 DnD，拖拽排序仅桌面/浏览器鼠标路径可用（与工作台栏内排序同限制，不在本期范围）。

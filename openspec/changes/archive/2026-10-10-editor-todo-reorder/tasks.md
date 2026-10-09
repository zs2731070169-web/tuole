# Tasks

- [x] 1. `src/shared/todos.ts`：`moveTodoItem(todos, todoId, targetIndex)` 纯函数（目标位按移除源项后的数组计、越界钳制、未知 id 原样返回、不突变入参）
- [x] 2. `tests/todos.test.ts`：头/尾/中间移动、未知 id、越界钳制、入参不变性锚定
- [x] 3. `TaskEditor`：待办项行首 GripVertical 手柄（静息 draggable=false 按下武装/松手复位、setDragImage 整行快照、写 `text/todo-row-id`）；列表容器 dragover/dragleave/drop 按几何中点算插入位 + 亮蓝指示线 + 源行降透明；`[task.id]` 复位拖拽态
- [x] 4. i18n：`editor.todoDragHandle` 新增；`editor.todoTickHint` 补拖拽排序提示
- [x] 5. `pnpm test` 全绿 + `pnpm typecheck` 通过；AGENTS.md 待办项条目补「编辑抽屉拖拽排序」口径

# 已完成任务的待办项一律显示为已勾选

## Why

用户需求（2026-10-17，附工作台截图）：工作台「已完成」栏任务展开的待办项要**全部默认自动打勾**。任务既然结束，其待办项整体视为已完成——完成时还剩一半未勾的展示与「已完成」语义矛盾。

## What Changes

**展示层派生，零存储改动**（与「状态由生命周期派生、永不入库」的既有哲学同构）：

- `src/shared/todos.ts` 新增纯函数 `todosForDisplay(todos, taskCompleted)`：已完成任务的待办项一律返回 `done: true` 的展示视图（已勾选项保持原对象引用，未勾选项派生新对象、不突变入参）；未完成任务原样返回同一数组引用（免拷贝）。
- 三处渲染同口径接线：
  1. 任务行 `TodoPanel`：勾选框实心 + 标题删除线按派生值渲染；
  2. 任务卡元信息行 `n/m` 计数与「待办项」展开按钮标签：分子按派生值（已完成任务恒 `m/m`）；
  3. 编辑抽屉待办项行首圆点与「已完成」徽标：按 `!!task.completedAt` 派生（编辑 buffer 仍存真实 `done`——编辑器本就不提供勾选，保存不回写）。
- **勾选锁定**：已完成任务的待办项勾选按钮 `disabled`；store `toggleTodo` 同口径防御——任务 `completedAt` 非空时 no-op（不 set / 不 persist），防未来调用方绕过 UI 写脏真实进度。

## 不改动 / 红线

- 零存储/迁移改动：真实勾选进度完整保留，**重新打开任务即回到真实勾选状态**（派生可逆，不采用「完成时全量回写 done」方案——那会在重新打开后丢失原进度）。
- 编辑抽屉不新增勾选操作（既有红线：勾选只发生在任务行 TodoPanel）；编辑抽屉对已完成任务增/改名/删/排序照常。
- 复制副本待办项 `done` 清零口径不变（副本是未安排新任务，不触发展示派生）。
- Excel 导出仍导出真实存储 `done`（数据互换层不做展示派生，导出 = 存储真相）。

## Impact

- `src/shared/todos.ts`（+1 纯函数）、`src/components/TaskItem.tsx`（计数两处 + TodoPanel/TodoRow）、`src/features/tasks/TaskEditor.tsx`（两处徽标）、`src/stores/useTaskStore.ts`（toggleTodo 防御）、`tests/todos.test.ts`、AGENTS.md 待办项条目。

## 迭代（审查后收尾）

- 编辑抽屉待办项提示文案分支（对抗审查发现，2/3+3/3 票确认）：`editor.todoTickHint` 的「去任务行勾选」分句对已完成任务指向已锁定入口——已完成任务改渲染只含拖拽分句的新键 `editor.todoDragHint`，未完成任务文案不变。

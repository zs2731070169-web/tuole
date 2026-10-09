# 日历 chip 拖拽迁移 + 「+N 更多」浮层只列溢出条目

## Why

用户需求（2026-10-09，截屏驱动）：①日历格内任务 chip 与「+N 更多」浮层里的任务项应可拖拽到任意日历格，快速迁移任务（此前只有工作台的 TaskItem 是拖拽源）；②浮层重复列出了格内已可见的前 2 条——应只显示格内装不下的溢出条目。

## What Changes

- **chip 拖拽源**：`CalendarView.chipDragProps`（格内 chip + 浮层条目共用）——静息 `draggable=false` 按下武装、pointerup/cancel/dragend 复位（TaskItem 防光标闪烁同款）；dragstart 写同一套载荷（`text/task-id` + `draggingStatus/draggingTaskId`），格子既有 onDrop 契约（`scheduleTo` + 清拖拽态）零改动复用；删除模式不武装（chip 点击 = 选日）。
- **配套防御**：轮播 `onGridPointerDown` 豁免 `[data-calendar-chip]`（拖 chip 不再触发拖月导航/吞 click）；`scheduleDayListClose` 在拖拽进行中不启动 240ms 关闭（防浮层卸载拖拽源、dragend 丢失）；chip `onDragEnd` 顺带收起浮层。
- **浮层只列溢出**：正文 `chips.slice(MAX_CHIPS)`；头部计数改「其余 N 项」（新 i18n 键 `calendar.dayListRemaining`）。

## Impact

- 文件：`CalendarView.tsx`、`lib/i18n.ts`；AGENTS.md 拖放契约与浮层条目口径。
- 纯交互层，无数据层改动；chip 点击两段式/跳转语义不变（原生拖拽有位移阈值，纯点击不触发）。

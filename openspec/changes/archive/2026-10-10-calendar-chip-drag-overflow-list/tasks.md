# Tasks

- [x] 1. `chipDragProps`：武装/复位 + 拖拽载荷 + 删除模式不武装；格内 chip 与浮层条目接入
- [x] 2. 配套防御：轮播 pointerdown 豁免 `[data-calendar-chip]`；`scheduleDayListClose` 拖拽中不关浮层；`onDragEnd` 收浮层
- [x] 3. 浮层只列 `chips.slice(MAX_CHIPS)` 溢出条目；计数 `calendar.dayListRemaining`（其余 N 项）
- [x] 4. `pnpm test` 全绿 + `pnpm typecheck` 通过；AGENTS.md 两处口径；重建 dist 与 妥了.app

## 迭代（2026-10-09 深夜：用户反馈两个 bug）

- [x] 5. **落点合法性 gate**：拖拽中的任务已覆盖目标日（`scheduledOnDay(draggedTask, key)`，含首尾）= 无效放置——onDragOver 不 preventDefault（无高亮、no-drop 光标）、onDrop 直接 return。根因：多天任务 chip 拖到自己执行期内会触发 scheduleTo 整段平移，表现为「同一天重复放任务」「其他格子的同名任务被改动」两个 bug 同源。
- [x] 6. 落到执行期之外 = 整段刚性平移（movedSchedule 保跨度，已有单测锚定）；`pnpm test` + typecheck 全绿；AGENTS.md 拖放契约补口径

## 迭代 2（2026-10-09 深夜：落点语义重定义）

- [x] 7. 用户二次反馈「多天任务拖走某天，其他格子落点被连带迁出」——整段平移语义废弃：`draggedSchedule` 纯函数（单日迁移 / 多日延长到目标日：期后延终点、期前提前起点、另一端不动、已覆盖零迁出、覆盖期内防御性原样）；store `rescheduleSpanToDay`（scheduleTo 同款副作用：改期重开、停靠日清空）；CalendarView onDrop 换用
- [x] 8. `tests/taskDates.test.ts` 五分支用例；全量测试 + typecheck；AGENTS.md 落点口径改写；重建产物

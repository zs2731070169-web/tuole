# Tasks

- [x] 1. 门禁纯函数扩参与单测：今天源 + 有任务过去格 = 允许；空过去格 / 非今天源 = 拒绝；两参既有调用行为不变
- [x] 2. store 集成锚点：今天格 chip 挪到过去日 → 只动那一天、startedAt/completedAt 保留、状态派生 overdue
- [x] 3. CalendarView：`draggingSourceDayRef`（dragstart 记录 / dragend + drop 清理），`isCalendarDropBlocked` 传 `chips.length`
- [x] 4. `pnpm typecheck` + `pnpm test` 全绿
- [x] 5. AGENTS.md 两处「过去格不接收拖放」旧口径补 2026-10-17 例外

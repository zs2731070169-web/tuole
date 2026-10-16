# 日历今天格的任务可回挪到「有任务的」过去格（移动 / ⌥ 复制）

## Why

用户需求（2026-10-17）：当前日期格子下的任务，可以移动或复制到**之前有任务的**日期格子下。场景 = 把今天实际发生在往日的事务归位回历史日（该过去格已有任务 = 用户确实在那一天工作过）。用户已确认目标格范围口径：**仅有任务的过去格**接收，空的过去格仍拒绝。

## What Changes

放宽 `shared/calendar.ts` 的 `canDropTaskOnCalendarDay`（原 2026-10-10「过去格不接收移动与 ⌥ 复制」+ 2026-10-14 重申口径的**定向例外**，其余边界不动）：

- 今天/未来格：任何来源照旧允许（含 ⌥ 复制）。
- 过去格：仅当 **拖拽源 = 今天格的 chip**（`text/task-source-day === today`）**且目标格本身有可见任务**（chips 数 > 0，与 `canOpenCalendarDay` 的「过去空格不可进入」同构同数据源）时允许；空的过去格、从其他过去格/未来格拖来的，一律维持拒绝（dragover 不高亮、drop 直接 return）。

落点动作复用既有分支，零新增语义：

- 移动 = `moveTaskDay(id, 今天, 过去日)`——只挪今天那一天，`startedAt`/`completedAt` 原样保留，执行期整体落入今天之前即派生 overdue（欠账，与工作台「拖入逾期目标」同语义；仍跨今天的多天集合按首末夹逼派生 today）。
- ⌥ 复制 = `duplicateTaskToDay(id, 过去日)`——单日副本落该过去日，`startedAt: null` 回未安排（既有副本口径）。
- 未安排 chip（空集合）从今天格拖到过去格 = `scheduleTo(id, 过去日)`（既有分支），日期落过去日、生命周期不变。

实现要点：dragover 阶段读不到 dataTransfer 的 `text/task-source-day`，源日在 CalendarView 以组件级 ref（`draggingSourceDayRef`）随 dragstart 记录、dragend/drop 清理——仅日历格消费，不入 ui store（`draggingStatus/draggingTaskId` 入 store 是因为跨组件消费，本次不满足）。

## 不改动 / 红线

- 空的过去格不接收（用户确认）；「过去格 → 过去格」「未来格 → 过去格」仍拒绝；今天/未来格照旧任何来源可放（2026-10-14 既有口径不变）。
- own-span 门禁（拖到自己执行期内的某天 = 无效放置）对所有落点照旧生效；删除模式、`interactiveDay` 限制不变。
- 工作台「拖入顶部逾期目标 = 排到昨天」独立入口不受影响；过去格照旧可删、可跳工作台（格内有任务时）。
- 浮层「复制」按钮（原地克隆）不属「落到过去格」路径，不变。

## Impact

- `src/shared/calendar.ts`（`canDropTaskOnCalendarDay` 扩参 + 注释）；`src/features/calendar/CalendarView.tsx`（源日 ref + 门禁传参）；`tests/calendar.test.ts`、`tests/taskDates.test.ts`（锚定用例）；AGENTS.md 两处口径。

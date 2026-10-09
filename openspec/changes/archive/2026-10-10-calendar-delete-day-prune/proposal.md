# 日历「按日期删除」改为按日修剪

## Why

用户反馈（2026-10-10）：跨天连续任务删除其中一天，把其他天的也连带整条删除了——不合理。与「拖拽只动被拖那一天」（2026-10-09 定调）同一心智模型：删一天 = 只移除那一天。

## What Changes

- **`planDeleteDaysPrune`**（shared/calendar.ts，取代 taskIdsOnScheduledDays ∪ unscheduledTaskIdsParkedOnDays）：多天任务从 `scheduledDates` 修剪所选日（任务保留）；**整条删除**仅三类 = 执行期全部命中 / 停靠所选日的未安排 / 完成日命中的已完成；草稿不入范围；空选中空规划。
- store 动作 **`deleteDaysFromTasks(days)`**：一次 set 应用删除 + 修剪，修剪任务落 `updatedAt`（与手动编辑同口径参与「当天提醒时刻后改动当天不提醒」）。
- CalendarLeadingBar：影响计数 = 整条删除 + 修剪数；确认文案改为明示「多天任务只移除所选日期（其余保留）；仅剩所选日期的任务、停靠的未安排与该日完成的任务被整个删除」。
- 旧 helper 及其旧语义测试删除，新增修剪规划 + store 集成用例。

## Impact

- shared/calendar.ts（重写）、useTaskStore、CalendarView（CalendarLeadingBar）、i18n（确认文案）；tests/calendar.test.ts 重写删除相关用例（198 项全绿）。

# 日历分组浅底：同组任务一律分组色背景填充

## Why

用户需求（2026-10-10）：日历表格内，同一个组下的任务应使用相同浅色背景填充。现行口径（2026-10-09）只对活动任务（today/upcoming）应用分组色，逾期/已完成/未安排仍走状态色背景——同组任务在不同生命周期下底色不一致，无法在日历里成块识别同组任务。

## What Changes

- **背景通道 = 分组**：日历格内 chip 与「+N 更多」浮层条目（`calendarChipTone`，自 CalendarView 迁至 `src/shared/calendarChipTone.ts`）对**任何带分组的任务**一律应用分组浅底（`group-tone-bg-N`，档位仍由分组名哈希决定），与任务生命周期无关。
- **文字通道 = 状态**：活动（today/upcoming）沿用「分组浅底 + 分组深字」既有观感；逾期红字、已完成灰字 + 自绘删除线、未安排灰字。状态语义不再占用背景通道（旧「仅活动态着分组色」口径废弃——状态可辨识性由文字色与删除线承载）。
- **色板拆单通道类**：styles.css 的 `group-tone-N`（背景+文字一体）拆为 `group-tone-bg-N` / `group-tone-text-N`（每色值仍只写一处）；`groupToneClass` 返回整对类（任务卡/编辑抽屉分组 chip 观感不变），新增 `groupToneBgClass` 供「背景=分组、文字=状态」混排。
- 无分组任务照走状态 chip（背景 + 文字整对），零变化。

## Impact

- 文件：新增 `src/shared/calendarChipTone.ts`、`tests/calendarChipTone.test.ts`；改 `src/shared/groups.ts`、`src/styles.css`、`src/features/calendar/CalendarView.tsx`（本地 tone 函数迁出）、`src/components/TaskItem.tsx`（分组 chip 注释同步新类名，零行为变化）、`tests/groups.test.ts`、AGENTS.md（分组条目 + 未安排停靠 chip 着色口径）。
- 纯展示层，无数据层/筛选/状态机改动。

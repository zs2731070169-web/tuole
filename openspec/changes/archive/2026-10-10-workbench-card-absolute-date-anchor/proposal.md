# 工作台卡片时间锚点改绝对日期

## Why

用户反馈（2026-10-09，截屏）：工作台选 10 月 10 日，进行中卡片的时间显示「明天」——`friendlyDate` 按**真实今天（9 日）**算相对词，而工作台视图框架是**选中日**，两个框架错位造成怪异感。工作台可浏览任意日（过去/未来），卡片锚点不该用相对真实今天的明天/昨天。

## What Changes

- 新增 `src/lib/date.ts` 纯函数：`absoluteDateLabel`（zh「10月10日」/ en「Oct 10」，locale 感知——顺手修复 `friendlyDate` 英文绝对分支渲染中文字面量「M月d日」的存量 bug）与 `workbenchDateLabel`（仅**真实今天**保留「今天/Today」，其余绝对日期）。
- `TaskItem` 元信息行四处日期锚点（安排日、截止日箭头、未安排停靠日、完成于）全部换用 `workbenchDateLabel`；`TaskItem` 只在工作台渲染，天然限定作用域。
- **改期弹层（SingleDateField）等真实时间框架仍用 `friendlyDate`**（明天/昨天在那儿语义正确）；`friendlyDate` 相对词行为不变。

## Impact

- 文件：`src/lib/date.ts`、`src/components/TaskItem.tsx`、`tests/date.test.ts`（新增 workbenchDateLabel/absoluteDateLabel 与 friendlyDate 英文回归用例）；AGENTS.md 元信息行条目补格式口径。
- 纯展示层变化，无数据层改动。

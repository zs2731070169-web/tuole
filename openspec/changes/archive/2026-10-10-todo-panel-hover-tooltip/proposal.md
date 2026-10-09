# 待办项悬停气泡显示完整内容

## Why

用户要求（2026-10-09）：任务项展开的待办项面板里，标题被截断的行看不出全文——悬停 0.5s 应弹气泡显示完整内容。

## What Changes

- `TaskItem` 的 `SubtaskPanel`（待办项面板）标题行挂 shadcn `Tooltip`：`TooltipProvider delayDuration={500}`（用户指定的 0.5s）、`skipDelayDuration={0}`（每一项都完整等 0.5s，连扫列表不连环弹）、`disableHoverableContent`（与节奏图/负载图同款——密集行场景旧气泡 grace 区会粘连相邻行）。
- **仅真正截断的行挂气泡**（`scrollWidth > clientWidth`，挂载时测量）：短标题弹同文气泡纯属噪音，与节奏图「n>0 才挂气泡」同口径。
- 组件 Tooltip 而非原生 `title`——系统气泡延迟约 1s 且样式不可控（仓库既有约定）；气泡内容 `max-w-72 break-words` 换行。
- 编辑抽屉的待办项输入行**不挂**：那是可编辑 input，聚焦即可见/编辑全文。

## Impact

- 文件：`src/components/TaskItem.tsx`（SubtaskPanel + 新增 TodoTitleWithTooltip）；AGENTS.md 待办项条目补口径。
- 纯展示层，无数据层改动；无新增纯逻辑（溢出测量为 DOM 行为，不设组件测试）。

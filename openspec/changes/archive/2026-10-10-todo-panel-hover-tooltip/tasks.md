# Tasks

- [x] 1. `TaskItem` SubtaskPanel：`TooltipProvider delayDuration={500} skipDelayDuration={0} disableHoverableContent`
- [x] 2. `TodoTitleWithTooltip`：仅截断行（scrollWidth > clientWidth，挂载测量）挂 Tooltip，内容 `max-w-72 break-words`
- [x] 3. `pnpm test` 全绿 + `pnpm typecheck` 通过；AGENTS.md 记录口径（禁原生 title、短标题不弹、编辑抽屉输入行不挂）

## 迭代（2026-10-09 用户反馈：悬停不必精准）

- [x] 4. 触发热区从「文字 span」扩到**整行 li**（`TodoRow` 组件：TooltipTrigger asChild 挂 li，勾选框/留白/文字都触发；溢出测量仍在文字 span 上）

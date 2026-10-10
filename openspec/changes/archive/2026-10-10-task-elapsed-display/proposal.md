# 任务耗时展示：执行花费时间纯派生上屏

## Why

用户需求（2026-10-10）：每个任务缺少「任务执行的花费时间」，希望补上。数据层已具备全部原料——`startedAt`（「安排 = 正式开展」的时刻戳，startTask/reopen 落 now、迁移回落 `updatedAt ?? createdAt`）与 `completedAt`（完成时刻戳）都是全 ISO 时间戳，耗时可以**纯派生**，零数据层/状态机改动。

## What Changes

- **耗时语义（纯派生）**：已完成 = `completedAt − startedAt`（「耗时 {t}」）；执行中（today/overdue）= `now − startedAt`（「已进行 {t}」）；未安排/未来安排不显示（执行未开始——upcoming 可能已带 startedAt 但展示会误导）。基准防御：`startedAt` 缺失回落 `createdAt`（历史近似）；时间戳非法或 end < start 不显示（end == start 的瞬间完成按分钟钳制展示为 1 分钟）。
- **单位阶梯（floor，最小钳 1 分钟）**：<1 小时 → N 分钟；<24 小时 → N 小时；≥24 小时 → N 天。
- **展示位**：任务卡元信息行（日期锚点之后，Timer 图标 + tabular-nums）；编辑抽屉头部 status chip 旁（只读 muted 文字，不进缓冲区）。
- **不展示**：日历格内 chip 与「+N 更多」浮层（92px 格高预算红线）；概览不加统计（固定头部/六块洞察布局红线）。
- **新鲜度说明**：进行中耗时随渲染时计算，无实时跳秒计时器（日粒度应用，scheduler 跨午夜结算触发重派生）。
- 契约集中在 `src/shared/taskElapsed.ts`（`computeTaskElapsed` + `formatTaskElapsed`（直接入 lang、模块内走真实词表）），tests/taskElapsed.test.ts 锚定；i18n 走 DICT（`task.elapsedSpent`/`task.elapsedRunning`/`elapsed.minute|hour|day`，zh/en 双语）。

## Impact

- 文件：新增 `src/shared/taskElapsed.ts`、`tests/taskElapsed.test.ts`；改 `src/lib/i18n.ts`（5 键）、`src/components/TaskItem.tsx`（元信息行）、`src/features/tasks/TaskEditor.tsx`（头部）、AGENTS.md（耗时口径条目）。
- 纯展示层派生，无 store/存储/Excel/状态机改动。后续可选跟进（不在本次范围）：Excel 任务表导出耗时列、概览平均耗时洞察。

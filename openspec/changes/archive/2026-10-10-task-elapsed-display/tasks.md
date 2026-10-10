# Tasks（先测后实现）

- [x] 1. `tests/taskElapsed.test.ts`：单位阶梯边界（30s→1 分钟钳制 / 59m59s→59 分钟 / 1h→1 小时 / 23h59m→23 小时 / 24h→1 天 / 3d2h→3 天）、spent/running/null 状态分类、startedAt 缺失回落 createdAt、非法时间戳与 end<start 防御（end==start 瞬间完成钳 1 分钟）、formatTaskElapsed 模板替换（{n}/{t}、spent/running 键选择）
- [x] 2. `src/shared/taskElapsed.ts`：`computeTaskElapsed`（纯函数，now 以 ISO 字符串注入）+ `formatTaskElapsed`（直接入 lang 走真实词表）
- [x] 3. `src/lib/i18n.ts` 5 键（task.elapsedSpent / task.elapsedRunning / elapsed.minute|hour|day，zh+en）；TaskItem 元信息行（日期锚点后，Timer 图标）与 TaskEditor 头部（status chip 旁 muted）接线
- [x] 4. AGENTS.md 耗时口径条目；OpenSpec 变更归档
- [x] 5. `pnpm test` + `pnpm typecheck` 全绿；重建 dist 与 妥了.app；对抗式审查工作流跑完并修复确认项

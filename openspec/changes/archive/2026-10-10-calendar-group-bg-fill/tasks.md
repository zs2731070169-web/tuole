# Tasks（先测后实现）

- [x] 1. `tests/calendarChipTone.test.ts`：同分组任意状态背景类恒为同一 `group-tone-bg-N`、无分组全走状态 chip、状态语义退文字通道（逾期红字 / 完成灰字 + 删除线 / 未安排灰字）、活动态整对分组色、无分组各状态回归既有状态色；`tests/groups.test.ts` 补 `groupToneBgClass` 与 `groupToneClass` 整对类新形态
- [x] 2. `styles.css` 色板拆 `group-tone-bg-N` / `group-tone-text-N` 单通道类（明暗双套）；`shared/groups.ts` 增 `groupToneBgClass`、`groupToneClass` 返回整对类
- [x] 3. 新增 `shared/calendarChipTone.ts`（STRIKE_LINE / statusChip / calendarChipTone 迁入并落新口径）；CalendarView 移除本地实现改 import
- [x] 4. AGENTS.md 分组条目更新口径（含「未安排任务进停靠日格」条目旧 statusChip 口径同步修正——对抗式审查发现项）；OpenSpec 变更归档
- [x] 5. `pnpm test`（226 用例）+ `pnpm typecheck` 全绿；重建 dist 与 妥了.app；对抗式审查工作流 4 维度 × 3 反驳者跑完，确认项已当场修复

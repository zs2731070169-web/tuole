# Tasks（先测后实现）

- [x] 1. `tests/overviewStats.test.ts`：`computeMonthInvestment` 用例改写——本月网格键序（1 日→月末）、未来日零贡献、跨月窗口按月切分、历史月（月长分母、todayMinutes=0）、monthKey 缺省/未来月回退当前月、日均分母（当前月=已过天数含今天）
- [x] 2. `shared/overviewStats.ts`：`computeOverviewStats` 移除 timeInvestment；新增 `computeMonthInvestment(views, now, monthKey?)`
- [x] 3. `InsightsPanel`：views props + 月锚点本地态 + ‹ › 步进（未来月禁用）+ 月标签 + 柱下两端日号；`routes/index.tsx` 改传 views；i18n 键增删
- [x] 4. `pnpm test` + `pnpm typecheck` 全绿；AGENTS.md 洞察条目/口径句跟进；OpenSpec 归档；重建 dist 与 妥了.app；紧凑对抗式审查

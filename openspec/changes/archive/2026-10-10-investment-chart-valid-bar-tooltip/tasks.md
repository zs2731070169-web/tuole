# Tasks（先测后实现）

- [x] 1. `InsightsPanel.tsx`：命中层 minutes<=0 早退不渲染 Tooltip；气泡主行仅剩 formatMinutesCompound；注释同步（含「描环」→「锚点位（基线刻度）」术语清理）
- [x] 2. i18n 删 `insight.investNone` / `insight.investFuture`；清理 CreationJumpBanner 孤儿注释；AGENTS.md 洞察条目 + Lessons Tooltip 条目终版口径（明确同日两轮旧口径作废）
- [x] 3. `pnpm typecheck` + `pnpm test` 全绿；无头浏览器悬停探针验证（有效柱弹气泡含时长/零值与未来日无气泡/今天柱含（今天）标记）；三视角对抗式审查（正确性/死代码/文档一致性，6 项发现全部当场处置）；重建 dist 与 妥了.app；OpenSpec 归档

# Tasks（先测后实现）

- [x] 1. `tests/taskElapsed.test.ts` 重写为窗口口径：提前安排从首日 00:00 起、逾期截断在末日 24:00、完成停在 completedAt、末日顺延自动恢复、staged（startedAt null）与 upcoming → null、瞬间完成钳 1 分钟、formatMinutesCompound 边界（59 分 / 1h05m / 24h / 3 天 2 小时 / en 同构）
- [x] 2. `tests/overviewStats.test.ts`：六洞察指标用例删除、六格指标用例保留、新增 timeInvestment（跨天窗口按日积分、今日含进行中部分、逾期尾巴不计、槽位 i=29=今天 镜像回归、7/30 天合计与日均）
- [x] 3. `shared/taskElapsed.ts`：`taskSpendWindow` 导出 + `computeTaskElapsed` 窗口化 + `formatMinutesCompound`；TaskItem/TaskEditor 展示位零改动接新口径
- [x] 4. `shared/overviewStats.ts`：删六指标段与 daily 槽、增 timeInvestment 日积分
- [x] 5. `StatsCard.tsx`：删节奏图与内联进度行、总体进度独立圆环卡（教训注释迁移）；`InsightsPanel.tsx` 重写为时间投入单卡（30 天迷你柱全套纪律）
- [x] 6. i18n 键增删；`pnpm test` + `pnpm typecheck` 全绿
- [x] 7. AGENTS.md（耗时窗口口径 / 概览固定头部 / 洞察面板+勿加回清单 / Lessons 措辞跟进）；OpenSpec 归档；重建 dist 与 妥了.app；对抗式审查工作流

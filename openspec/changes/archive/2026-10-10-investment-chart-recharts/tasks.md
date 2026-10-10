# Tasks（先测后实现）

- [x] 1. `pnpm add recharts@^3`；`ui/chart.tsx` 更新为官方 recharts 3 版（仅改 cn 别名、去 use client）
- [x] 2. `InsightsPanel.tsx`：MonthBars 重写为 ChartContainer + BarChart/Bar + ChartTooltip（labelFormatter 日期 / formatter 时长）；删自研几何（ResizeObserver/取整/命中层/barHeightOf）；ReferenceArea 今天背景带；动画与游标全关
- [x] 3. styles.css：`.invest-chart` 指针事件穿透（wrapper/surface none、柱体 auto）——实测 recharts 默认整绘图面激活气泡，空档/空白悬停会弹
- [x] 4. `pnpm typecheck` + `pnpm test` 全绿
- [x] 5. 无头浏览器验证：三配置（1440 rich / 760 rich / 1440 今天零投入）几何零越界 + 页面零滚动；有值柱弹气泡（含（今天）标记）；空档/空白/今天零投入带悬停一律无气泡；历史月无今天带
- [x] 6. AGENTS.md 两条目重写（自研几何退役、recharts 终版口径、指针穿透勿移除）；记忆 user-screen-rendering-artifacts 更新；重建 dist 与 妥了.app

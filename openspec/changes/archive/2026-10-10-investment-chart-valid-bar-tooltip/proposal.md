# 时间投入柱：气泡收敛回「仅有效柱」（用户定调）

## Why

用户定调（2026-10-10 晚，截屏 21.01.34 反馈）：概览柱状图应「只有鼠标移动到有效的蓝色柱状图才允许弹出气泡」。
同日早前两轮口径（「n>0 门控被否 → 全柱气泡」）在实测中让零值占位日、未来日、今天零投入锚点也弹
「无投入/未到」，信息价值低于打扰成本，终版定调收敛回有效柱。附带核实：同截屏反馈的柱图「超出底部」
为旧构建所见（96px 容器 + 2px 今天基线刻度外溢，已由 21:16 的 98px 容器修复）；当前版本经无头浏览器
实测（1440/760 两档宽度）几何零溢出、命中 span 恰为有效柱数，无需再改几何。

## What Changes

- 命中层（`MonthBars`）`minutes <= 0` 早退不渲染 Tooltip：零值日、未来日、今天零投入锚点一律悬停零响应；
  有效柱（minutes > 0 的蓝色柱）命中几何不变（同 left/宽，top/高 = 柱体本身，今天含 2px 基线刻度），
  绘制层与命中层仍共用 `barHeightOf`。
- 气泡内容去掉三态分支，主行只剩 `formatMinutesCompound` 时长（日期弱化小字与「（今天）」标记不变）。
- i18n 删 `insight.investNone` / `insight.investFuture` 两键（全库零引用）。
- 注释与 AGENTS.md（概览洞察条目、Lessons Tooltip 条目）同步终版口径，并顺手清理「今天描环」
  （SVG 重绘前旧术语，现行锚点 = 轴线下 2px 基线刻度）与 i18n 中 CreationJumpBanner 孤儿注释
  （该功能已整体删除，AGENTS.md 明记勿复活）。

## Impact

- 文件：`components/InsightsPanel.tsx`、`lib/i18n.ts`（−2 键）、AGENTS.md；纯视图层交互门控，
  统计口径（`computeMonthInvestment`）与 tests 零变化。

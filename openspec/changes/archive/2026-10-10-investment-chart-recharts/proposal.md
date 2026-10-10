# 时间投入柱图：改用 shadcn Chart（recharts 3）现成组件

## Why

用户定调（2026-10-10 晚，两连发）：柱图「一直有问题，换个方案重新实现」→ 方向确认后追加
「不是有现成的 UI 组件吗」。当日自研几何已三代返工（百分比 div 柱「发虚」→ 手绘整像素 SVG +
HTML 命中层「底部溢出/命中漂移」→ 单层 SVG），三类问题（细边亚像素模糊、固定高度预算溢出、
双层几何手工同步）全部源自「手搓像素几何」这一实现族本身——继续在自研框架内打补丁无解，
用户明确要求换用现成图表组件。

## What Changes

- **渲染层整体替换**：`MonthBars` 改为 shadcn Chart（`ui/chart.tsx` 官方文件随 recharts 3 更新，
  仅改 `cn` 别名）+ recharts 3.10：`ChartContainer`（覆写 `aspect-auto h-[96px] w-full`）+
  `BarChart/Bar`，XAxis/YAxis 隐藏（两端日号锚点行保留为 HTML）。自研几何代码
  （ResizeObserver 测宽、柱宽/间隙/居中取整、barHeightOf、手写 SVG、独立命中层）全量删除。
- **气泡**：recharts `Tooltip` + `ChartTooltipContent`（`labelFormatter` = investDateLabel 日期文案
  含「（今天）」；`formatter` = formatMinutesCompound 时长）；`cursor={false}` + 全部
  `isAnimationActive={false}`（清晰度优先）。
- **「只有有效蓝色柱才弹气泡」由结构保证**：零投入日/未来日无柱即无悬停目标，无门控代码。
  recharts 默认在整个绘图面激活最近数据点（空档/空白悬停也会弹，无头浏览器实测确认），故
  styles.css 新增 `.invest-chart` 规则：wrapper/surface `pointer-events:none` 穿透、仅
  `.recharts-bar-rectangle` 显式 `auto`（pointer-events 在 SVG 内继承）。
- **今天锚点**：`ReferenceArea` 浅蓝背景带（`status-today` 8%，与日历今天格同信号量，宽面无细边，
  历史月不渲染、带本身不可悬停）——取代历代的 轴下基线刻度/柱内缺口条/描环。
- 依赖：`recharts ^3.10.1`（React 19 兼容；主 chunk 体积增加属预期，同 xlsx chunk 警告待遇）。

## Impact

- 文件：`components/InsightsPanel.tsx`（MonthBars 重写）、`components/ui/chart.tsx`（官方 v3 版替换
  旧 recharts2 时代生成件）、`styles.css`（+指针穿透规则）、`package.json`（+recharts）、
  AGENTS.md（洞察条目与 Lessons Tooltip 条目重写）、记忆 user-screen-rendering-artifacts。
  数据口径（`computeMonthInvestment`）、i18n、tests 零变化。
- 视觉变化（有意）：零投入/未来日从「6px muted 占位柱」变为「无柱空档」——标准柱图语义，
  也是「仅有效柱可悬停」的结构前提。

## 后记（同日深夜）

本归档所述实现被用户实测否决（「还不如之前，退回去」），已整体回滚——见
`2026-10-11-investment-chart-recharts-reverted`。本目录仅作尝试记录留档，**非生效实现**。

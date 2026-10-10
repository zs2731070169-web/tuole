# 时间投入柱图：recharts 版被否决，整体回滚至自研整像素实现

## Why

用户实测（2026-10-10 深夜构建后）：recharts 版「还不如之前」，定调「退回去」。观感基线差异：
自研版有 muted 占位柱（零值/未来日 6px 占位、整数像素边线），recharts 标准柱图为零值日留空 +
分数坐标渲染——标准库默认观感被该用户视为退步。当晚 recharts 尝试从实现到回滚全程约半小时，
未产生任何提交。

## What Changes（回滚清单）

- `components/InsightsPanel.tsx`：MonthBars 恢复为自研整像素 SVG + HTML 命中层版本
  （即 2026-10-10 晚「仅有效柱挂气泡」定稿：98px 容器、轴下 2px 今天基线刻度、
  零值 6px muted 占位、命中 span 仅 minutes > 0 渲染）。
- `components/ui/chart.tsx`：恢复仓库原文件（recharts 2 时代生成件，git checkout）。
- `package.json`：recharts 恢复 ^2.15.4（脚手架既有依赖，供 chart.tsx 引用）；`pnpm install` 同步。
- `styles.css`：删除 `.invest-chart` 指针事件穿透规则（随 recharts 版整体消失）。
- AGENTS.md：洞察条目与 Lessons Tooltip 条目恢复自研版口径，并新增「换图表库已被否决
  （2026-10-10 深夜）勿再提议」守门句；记忆 user-screen-rendering-artifacts 同步换库翻车教训。

## Impact

- 保留不变：2026-10-10 晚的「仅有效柱挂气泡」口径与 `insight.investNone/investFuture` i18n 键删除
  （回滚目标是 recharts 之前的定稿，该定稿本就含此口径）。
- 相关归档：2026-10-10-investment-chart-recharts（被否决的尝试，留档勿删）、
  2026-10-10-investment-chart-single-layer-svg（同晚被放弃的中间方案，已删除目录——从未构建交付）。

# 时间投入柱：全柱气泡 + 实心柱色（用户实测反馈修复）

## Why

用户实测（2026-10-10 截屏反馈）：柱状图「看着很模糊」且「鼠标移上去没有气泡」。定位：
1. 旧「n>0 才挂气泡」门控继承自节奏图——零投入日/未来日柱子悬停零反馈，用户扫过大片低柱区域全程无响应，体验等同故障（此前对抗式审查的一条被否发现被用户实测坐实，口径反转）。
2. 柱体 `status-today/70` 半透明浅蓝叠 `bg-card/85` 半透明卡片，细柱边缘被半透明 + 抗锯齿吃掉，观感发虚（文字清晰、无滤镜残留，排除整页问题）。

## What Changes

- **全柱气泡**：每根柱都挂组件 Tooltip——有值 → 复合时长；已过零投入日 →「无投入」；当前月未来日 →「未到」（历史月无未来日）。Tooltip 工艺不变（delayDuration=0 + disableHoverableContent）。
- **柱色实心**：有值柱 `bg-status-today`（原 /70），悬停抬亮改用 ring 描边（`group-hover/bar:ring-1`）；零值/未来柱维持 muted 占位。
- **今天锚点补齐**：今天零投入时也画 `status-today/25 + ring` 的短柱（原实现零投入今天与普通空日完全同款，「现在在哪」失去锚点——审查被否发现的第二半，一并修复）；历史月无描环。
- i18n 增 `insight.investNone` / `insight.investFuture`；AGENTS.md Lessons「气泡只挂 n>0」条目与洞察条目、dataviz 句同步反转口径。

## Impact

- 文件：`components/InsightsPanel.tsx`、`lib/i18n.ts`（+2 键）、AGENTS.md 三处措辞；纯视图层，统计口径与 tests 零变化。

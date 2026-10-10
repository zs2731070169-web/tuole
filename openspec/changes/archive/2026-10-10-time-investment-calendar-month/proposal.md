# 时间投入改自然月网格：月底复盘对齐日历月

## Why

用户反馈（2026-10-10 截屏追问）：滚动 30 天窗口（29 天前 → 今天）与「自然月复盘」心智对不上——月底想复盘时，看到的窗口起点是月中旬的某天。按自然月排布（本月 1 日 → 月末）才好对账。

## What Changes

- **柱图 = 本月自然月网格**：1 日 → 月末逐日（28–31 根），日期升序、右端为月内最后一天；**未来日渲染静态占位柱**（无数据、无气泡，与无投入日同款）；今天描环。
- **月份切换**：卡片标签行右侧 ‹ 月份 › 步进器——可回看任意历史月（复盘 10 月不再受 11 月 1 日开应用影响），**未来月禁用**。月锚点为 InsightsPanel 组件本地态（图表导航、非筛选——不触碰「概览零筛选控件」红线：不改变任何任务列表/统计的数据范围语义，只翻图表月份视图）。
- **主数字换月口径**：本月投入合计（复合格式）+ 副行「本月日均 · 今日」；历史月副行只给「月日均」（今日无意义）。日均分母：当前月 = 已过天数（含今天）、历史月 = 当月天数。
- **契约迁移**：`timeInvestment` 从 `computeOverviewStats` 返回值移出，改为独立导出 `computeMonthInvestment(views, now, monthKey?)`（仍在 overviewStats.ts 唯一真相源；monthKey 缺省/为未来月 → 回退当前月）；StatsCard 六格口径零变化（本周/近 30 天完成仍是滚动窗口，与柱图解耦）。InsightsPanel props 从 `stats` 改为 `views`，内部 useMemo 按月锚点派生。
- **可读性锚点**：柱下两端日号标签（左「1日」右「{月末}日」），排序方向不再靠猜。

## Impact

- 文件：改 `shared/overviewStats.ts`、`components/InsightsPanel.tsx`、`routes/index.tsx`（传 views）、`lib/i18n.ts`（删 investHeadline 旧键，增月口径/步进器键）、`tests/overviewStats.test.ts`（timeInvestment 用例改写为月网格）；AGENTS.md 洞察条目与口径句跟进。
- 纯展示层，无 store/存储/状态机改动。

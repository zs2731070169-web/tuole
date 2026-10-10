# 任务开销窗口计时 + 概览时间投入仪表盘（洞察六块下线）

## Why

用户需求演进（2026-10-10，三轮收敛定稿）：
1. 任务开销时间 = **只在「进行中」计时**——未安排/未来安排不计时、已完成停在完成时刻、逾期超出末日的部分不计（改期/顺延推后末日即自动恢复）。该口径可由现有字段**纯派生**（零存储改动、零新控件），历史任务全部可回溯。
2. 概览洞察六块（按期完成率/本周环比/逾期账龄/未结优先级分布/未来 7 天负载/近 30 天新建 vs 完成）**整体下线**——用户定调「对我无意义」。
3. StatsCard 去掉近 30 天节奏图（同样无意义）；「总体进度」拆成独立卡片配**圆环进度条**。
4. 概览新增唯一洞察块：**时间投入**（近 7 天合计 + 日均 + 今日 + 近 30 天每日投入迷你柱）。

**舍弃说明**：待办项单独计时（含「总时间 = Σ 待办项」关系）随口径演进取消——计时锚点定义在任务生命周期上，待办项无独立时钟。

## What Changes

- **开销窗口（`shared/taskElapsed.ts` 重写口径）**：`taskSpendWindow(task, now)` = `[max(startedAt ?? createdAt, 执行首日 00:00), min(completedAt ?? now, 执行末日 24:00)]`；状态门不变（today/overdue/done 才计算，unscheduled/upcoming → null）；窗口空/时间戳非法/end < start → null（瞬间完成钳 1 分钟保留）。`computeTaskElapsed` 基于窗口派生（单位阶梯/文案组装不变）；新增 `formatMinutesCompound(minutes, lang)`（复合单位：<1h → N 分钟；<24h → N 小时 M 分；≥24h → N 天 M 小时；en 同构）。任务卡 ⏱ 位与编辑抽屉头部**口径切换为窗口版**（显示位/i18n 键不变）。
- **概览统计（`shared/overviewStats.ts`）**：
  - 删：六洞察指标全部派生段（onTimeRate/逾期账龄/未安排积压/未来负载/环比/剪刀差/优先级分布）与 StatsCard 节奏图 daily 槽（daily/dailyKeys/peak）。
  - 留：六格指标（total/totalDone/overdue/unscheduled/active/weekCompleted/monthCompleted）。
  - 增：`timeInvestment`——近 30 天（含今天）每日投入分钟数（每任务 `taskSpendWindow` ∩ 当日 [00:00, 24:00) 的毫秒积分，含进行中任务的当日部分；槽位 i=0 = 29 天前、i=29 = 今天，与旧 daily 槽同序防镜像错配）+ 7 天/30 天合计 + 今日 + 日均（7 天合计 / 7，四舍五入分钟）。
- **StatsCard**：删节奏图区与头部内联进度行（含移动端小 Ring）；「总体进度」独立成卡——SVG 圆环（画法迁移自被删的 OnTimeRing：viewBox 1:1、半径/描边取整像素、`shapeRendering="geometricPrecision"`、属性级旋转；track `stroke-muted`、进度弧 `stroke-status-today`；**保留「圆环毛边锯齿系屏幕问题、勿反复改 conic-gradient」教训注释**），中心百分比（只按百分比展示、不给数量口径的既有决策不变），无任务/全部完成状态短句随卡。布局 = 圆环卡与六格指标行同排（lg 起横排、窄屏堆叠）。
- **InsightsPanel 重写**：六块全删，仅渲染「时间投入」单卡（全宽）：左侧主数字（7 天合计，复合格式）+ 副行（日均 · 今日），右侧近 30 天每日投入迷你柱——柱图纪律全套沿用节奏图工艺（组件 Tooltip `delayDuration=0` + `disableHoverableContent`、全高命中区、tabIndex=-1、**n>0 才挂气泡**、今天实心描环、无值静态占位柱、仅过渡 height）。
- **红线不变**：纯只读零筛选交互；文本用文本 token、数据色只上柱；概览固定头部不新增统计；日历/工作台不受影响。

## Impact

- 文件：改 `shared/taskElapsed.ts`、`shared/overviewStats.ts`、`components/StatsCard.tsx`（重写头部+删节奏图）、`components/InsightsPanel.tsx`（重写为单卡）、`lib/i18n.ts`（删 insight.* 六块键 + stats.trend；增时间投入/圆环卡键）、`tests/taskElapsed.test.ts`（窗口用例）、`tests/overviewStats.test.ts`（六指标用例删、timeInvestment 用例增）；AGENTS.md 三条目改写 + 六指标/节奏图进勿加回清单。
- 纯展示层派生 + 组件重写，无 store/存储/状态机/Excel 改动。

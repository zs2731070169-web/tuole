# overview-insights 规格（ADDED）

## ADDED Requirements

### Requirement: 按期完成率

已完成任务中，完成日不晚于执行期结束日（`scheduleEnd`，即 dueDate ?? scheduledDate）的占比。执行期基准缺失的已完成任务不参与统计（不计分子也不计分母）。

#### Scenario: 截止日为基准

- **WHEN** 任务 scheduledDate=10-01、dueDate=10-05、完成于 10-05
- **THEN** 判定按期（完成日 = 结束日，含当天）

#### Scenario: 拖欠后完成

- **WHEN** 任务单日任务 scheduledDate=10-01、无 dueDate、完成于 10-03
- **THEN** 判定逾期完成（10-03 > 10-01）

#### Scenario: 无基准排除

- **WHEN** 已完成任务无 scheduledDate 且无 dueDate（历史/导入数据）
- **THEN** 不计入分母，按期率仅由可判定任务构成；无可判定任务时显示「—」

### Requirement: 逾期账龄分布

status 为 overdue 的任务按账龄（今天 − `scheduleEnd`，日历日差，最小 1）分桶：1–3 天 / 4–7 天 / ≥8 天；同时给出最长账龄。

#### Scenario: 桶边界

- **WHEN** 结束日为昨天 / 3 天前 / 4 天前 / 7 天前 / 8 天前
- **THEN** 依次落入 1–3 桶 / 1–3 桶 / 4–7 桶 / 4–7 桶 / ≥8 桶

#### Scenario: 无逾期

- **WHEN** 没有任何 overdue 任务
- **THEN** 三桶全 0、最长账龄显示「—」

### Requirement: 未安排积压年龄

status 为 unscheduled 的任务，停靠日 = parkedDate，缺失兜底为 createdAt 的日期；停靠超过 7 天（≥8 天）计为积压，输出积压数与未安排总数。

#### Scenario: 停靠第 8 天起计积压

- **WHEN** 未安排任务停靠 7 天前 / 8 天前
- **THEN** 分别不计 / 计入积压

#### Scenario: 停靠日缺失

- **WHEN** 未安排任务无 parkedDate、createdAt 为 10 天前
- **THEN** 以 createdAt 为停靠日，计入积压

### Requirement: 未来 7 天负载

今天起含今天共 7 天（today … today+6），每日计数 = 未完成任务中执行期覆盖该日（`scheduledOnDay`）的数量；未安排任务不计。

#### Scenario: 跨日执行期逐日记数

- **WHEN** 活动任务执行期 10-08 至 10-10，今天是 10-08
- **THEN** 7 天柱状图前 3 天（10-08/09/10）各 +1，其余天不计数

#### Scenario: 已完成任务不计入

- **WHEN** 任务执行期覆盖今天但已完成
- **THEN** 不计入任何一天的负载

### Requirement: 本周完成环比

本周（周一起算）完成数对比上周完成数；上周为 0 时不给百分比（显示「—」），差为 0 显示「持平」，否则 ±百分比。

#### Scenario: 上周为零

- **WHEN** 上周完成 0 项、本周完成 3 项
- **THEN** 本周完成 3 · 环比显示「—」

#### Scenario: 常规环比

- **WHEN** 上周完成 4 项、本周完成 3 项
- **THEN** 环比 −25%

### Requirement: 近30天新建与完成剪刀差

窗口 = 近30天含今天（与节奏图同口径）：新建 = createdAt 落窗口的任务数（含已完成），完成 = completedAt 落窗口的任务数；净差 = 新建 − 完成。

#### Scenario: 净积压

- **WHEN** 窗口内新建 12、完成 8
- **THEN** 新建 12 · 完成 8 · 净 +4（正数弱红提示积压增长）

### Requirement: 未结优先级分布

未结任务（无 completedAt，含未安排/未来/今天/逾期）按 高/中/低/无 四档统计数量与占比，分段条宽度按占比、色取 priority token（「无」用 muted）。

#### Scenario: 已完成任务不参与

- **WHEN** 高优任务 2 条已完成、未结任务为 高1 / 中2 / 无3
- **THEN** 分布 = 高1 / 中2 / 低0 / 无3，共 6

### Requirement: 概览任务列表折叠降权

列表默认折叠为一行「任务列表（N）+ 查看全部任务」；展开渲染既有列表与分页；无任务不渲染折叠行（EmptyState 兜底）；折叠态不持久化。

#### Scenario: 默认折叠与手动展开

- **WHEN** 进入概览（有任务）
- **THEN** 列表折叠；点「查看全部任务」展开并出现「收起」按钮

#### Scenario: 空列表

- **WHEN** 没有任何任务
- **THEN** 不渲染折叠行，显示 EmptyState

### Requirement: 概览无筛选控件（迭代 2，2026-10 同日用户决策）

概览不渲染状态筛选栏与 ViewToolbar（搜索/优先级/日期/刷新/Excel 均无入口，仅存在于日历与工作台）；概览列表与统计恒为全量任务，忽略其他视图遗留的全部筛选条件。

#### Scenario: 其他视图遗留条件不影响概览

- **WHEN** 用户在工作台设置了优先级=高、在日历设置了状态=逾期，然后切到概览
- **THEN** 概览统计与列表仍显示全部任务，切回原视图筛选仍在

### Requirement: 洞察面板左中右三部分（迭代 2，2026-10 同日用户决策）

洞察卡内部按语义拆为左中右三列，每列 = 组标题 + 两个上下排布的指标块：左「完成表现」（按期完成率、本周 vs 上周）；中「积压与结构」（逾期账龄、未结优先级分布）；右「负载与流量」（未来 7 天负载、近 30 天新建 vs 完成）。窄屏退化单列堆叠。

#### Scenario: 宽屏三列分组

- **WHEN** 视口宽度 ≥ md 断点
- **THEN** 三列并排、列间 hairline 分隔，每列顶部为组标题、其下两个指标块以 border-t 分隔

### Requirement: 统计派生单点纯函数

全部概览统计（既有六格 + 节奏图 + 新六块）由 `src/shared/overviewStats.ts` 的 `computeOverviewStats(views, now)` 纯函数派生，组件零内联计算；`tests/overviewStats.test.ts` 覆盖上述全部口径。

#### Scenario: StatsCard 渲染不变

- **WHEN** 计算迁移到 shared 后
- **THEN** StatsCard 六格/进度行/节奏图的渲染与数值口径不变（既有 daily 槽位镜像 bug 回归用例保持通过）

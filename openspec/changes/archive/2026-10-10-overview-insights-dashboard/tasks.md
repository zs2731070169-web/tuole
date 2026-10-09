# Tasks（TDD 顺序：每个口径先测后实现）

## 1. shared 纯函数 + 既有口径迁移

- [x] 1.1 新建 `src/shared/overviewStats.ts`：定义 `OverviewStats` 类型，先迁移 StatsCard 既有口径（total/totalDone/overdue/unscheduled/active/weekCompleted/monthCompleted/daily/dailyKeys/peak）
- [x] 1.2 新建 `tests/overviewStats.test.ts`：既有口径回归（周/月窗口、daily 槽位正序 = 镜像 bug 用例、无任务边界）
- [x] 1.3 按期完成率：实现 + 测试（截止日基准 / 单日基准 / 拖欠完成 / 无基准排除）
- [x] 1.4 逾期账龄分桶 + 最长账龄：实现 + 测试（1/3/4/7/8 边界、无逾期、dueDate 基准）
- [x] 1.5 未安排积压年龄：实现 + 测试（7/8 天边界、parkedDate 缺失兜底 createdAt）
- [x] 1.6 未来 7 天负载：实现 + 测试（跨日执行期逐日记数、已完成不计、未安排不计）
- [x] 1.7 本周环比 + 近30天新建/完成剪刀差：实现 + 测试（上周 0 → null、净差正负）
- [x] 1.8 未结优先级分布：实现 + 测试（已完成不参与、四档计数与总数）

## 2. 组件与接线

- [x] 2.1 StatsCard 改为消费 `computeOverviewStats` 结果（Props 换 stats 入参，渲染零变化），routes/index.tsx 单点 useMemo 计算
- [x] 2.2 新建 `src/components/InsightsPanel.tsx`：六块网格（1/2/3 列响应式），环形/分桶条/双柱/迷你柱/分段条（dataviz 校验色板 + mark 规范），i18n 双语键（insight.* / priority.* / overview.*）
- [x] 2.3 routes/index.tsx：洞察面板插入滚动流（占位层之下）
- [x] 2.4 列表折叠：CollapsibleTaskList——默认折叠「任务列表（N）+ 查看全部任务」、展开/收起、筛选变化自动展开（跳过首次挂载）、空列表不渲染折叠行
- [x] 2.5 `pnpm test`（150/150）+ `pnpm typecheck` + `pnpm build` 全绿；dev 实拍验证：静态渲染六块、点击展开见 6 卡 + 分页、点筛选「逾期」自动展开、重载复位折叠

## 3. 收尾

- [x] 3.1 实现后必审：清理 LoadBlock 冗余包装 div、补 loadDateLabel 今天标记与注释一致性
- [x] 3.2 AGENTS.md 记录新决策（洞察面板口径 + 色板结论 + 列表折叠降权），CLAUDE.md 目录清单同步

## 4. 迭代 2（2026-10 同日用户反馈：移除筛选栏/工具行 + 三栏分组）

- [x] 4.1 概览固定头部移除 StatusFilterBar 与 ViewToolbar（仅剩 StatsCard）；搜索/筛选/Excel 入口保留在日历与工作台
- [x] 4.2 `filtered` 的 all 分支返回全量 views（忽略其他视图遗留筛选，防隐性过滤）；countViews 注释收窄为日历口径
- [x] 4.3 CollapsibleTaskList 移除「筛选变化自动展开」（概览已无筛选控件，死逻辑清理）
- [x] 4.4 InsightsPanel 拆左中右三部分：完成表现 / 积压与结构 / 负载与流量（组标题 + 列内两块，窄屏单列堆叠）；i18n 组标题键
- [x] 4.5 typecheck + 150 测试全绿；dev 实拍确认：筛选栏/工具行消失、三列分组渲染、折叠行完好
- [x] 4.6 AGENTS.md 两章节更新为迭代后口径

## 5. 迭代 3（2026-10 同日用户决策：任务列表整体移除）

- [x] 5.1 routes/index.tsx 删除 CollapsibleTaskList / AllListView / useDragToScroll / pageWindow / TaskRow / ALL_PAGE_SIZE 与渲染接线；概览 = 固定 StatsCard + 洞察面板即全部
- [x] 5.2 `TaskItem` 删除 readOnly 形态（prop + 全部分支，工作台为唯一渲染方）；删除 `EmptyState` 组件与 `overview.*` i18n 键
- [x] 5.3 AGENTS.md 列表相关条目更新为移除后口径（分页/拖拽滚动/分页条样式/纯查看条目墓碑化）
- [x] 5.4 typecheck + 150 测试 + build 全绿；dev 实拍确认概览无列表残留

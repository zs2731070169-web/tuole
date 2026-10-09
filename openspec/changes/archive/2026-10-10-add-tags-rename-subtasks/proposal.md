# 任务标签 + 「子任务」改名「待办项」（含编辑器字段换位）

## Why

用户要求（2026-10-09）：①给每个新建任务添加标签功能——此前契约刻意不设 tags 维度（AGENTS.md「无标签概念」），现决策反转，任务需要轻量分类标注；②「子任务」在产品词汇上改叫「待办项」（功能与数据不变，仅命名与位置调整）；③编辑抽屉里「待办项」与「备注」位置互换——待办项上移至基本信息区，备注这种长文本沉底。

## What Changes

### 1. 任务标签（新维度）

- **契约**：`Task.tags: string[]`（空数组为默认态）。自由输入、无预置标签库、不参与任何筛选/状态语义；状态机、工作台分桶、日历归桶、统计口径全部不读 tags。
- **纯函数**：新建 `src/shared/tags.ts` —— `parseTags(raw)`（按 `,，、;；|｜` 与换行切分、trim、去空、按序去重）、`formatTags(tags)`（`、` 连接，供 Excel 单元格）、`normalizeTags(unknown)`（存储载入校验：非字符串元素丢弃、逐元素再 parse、去重）。单测锚定。
- **编辑抽屉**：「标签」字段（位置：标题之后）。已加标签渲染为 chip（× 移除）；输入框回车提交（输入内容同样走 parseTags，粘贴「a,b」一次得两个标签）；空输入框 Backspace 删末尾标签。全缓冲编辑——只动本地 state，随「保存」一次 `updateTask` 原子落库。
- **任务卡**：元信息行追加标签 chip（muted 文本色、无数据色），渲染在优先级标记之后；日历格 chip 不展示标签（92px 格高预算红线）。
- **存储**：`loadTasks` 对 tags 做数组校验归一（缺失/坏形状 → `[]`；远古版本遗留的合法 tags 字符串数组予以保留——本就出自用户之手）。
- **Excel 往返**：任务表新增「标签」列（导出 `formatTags`、导入 `parseTags`），浏览器 `excel.ts` 与桌面 `electron/excel.cjs` 双端一致。「更新匹配」对标签按文件是否带该列区分语义（`hasTagsColumn`）：旧导出无列 = 「未提及」→ 保留存量标签、不参与变化比较；有列且为空 = 明确清空。**恢复入口归一**：`importTasks`（快照/JSON 备份恢复）对传入任务按 `normalizeTags` 补形状——旧快照无 tags 字段，不归一会在渲染层 `task.tags.map` 崩溃白屏。

### 1.1 复审加严（2026-10-09 对抗式复审后）

- 标签/待办项输入框 Enter 加 `isComposing` 守卫（中文输入法确认候选不提交，与 SearchBox 同款）。
- Excel 任务表列头「说明」同步改「备注」，与同批 UI 词汇更名对齐（导入别名同时认「说明」「备注」，旧文件不受影响）。

### 2. 「子任务」→「待办项」（纯命名，零行为变化）

- 功能、数据契约、勾选交互全部不变：`Task.subtasks` 字段名、store action（addSubtask 等）、SubtaskPanel 组件等**内部标识保留**（改数据字段名需迁移存量 `~/.tuole`/localStorage 数据，收益仅是词汇一致，风险不成比例——UI 词汇与内部契约解耦）。
- 改动范围 = 用户可见文案：编辑抽屉字段名与占位/提示、TaskItem 展开/计数 aria-label、SubtaskPanel aria-label、i18n 值（键名不动）、Excel「子任务」表与列头 →「待办项」。en 文案 `Subtasks` → `To-dos`。
- **导入兼容**：旧导出文件里的「子任务」sheet/列头仍可读取（导入匹配同时认「待办项」「子任务」两个名字，旧文件不报废）。

### 3. 编辑抽屉字段换位

「待办项」与「备注」互换。新顺序：**标题 → 标签 → 待办项 → 优先级 → 执行时间 → 备注**（长文本备注沉底，标题后紧跟轻量的标签与待办项）。

## 不改动 / 红线

- 子任务的增/改名/删 + 行内勾选分工不变（编辑抽屉管内容、TaskItem 面板管勾选）。
- 标签是纯展示性元数据：不进筛选栏、不进搜索匹配、不进状态机与统计；界面不出现「标签选择器」之类预设库控件。
- 全缓冲编辑与「保存 = 唯一提交点」不变；标签随保存原子落库，X/遮罩关闭丢弃。
- Excel 子任务分表结构不变（仅更名）；隐藏关联元数据表不变。

## Impact

- 文件：改 `shared/types.ts`、`stores/useTaskStore.ts`、`lib/storage.ts`、`features/tasks/TaskEditor.tsx`、`components/TaskItem.tsx`、`components/TaskIOButtons.tsx`、`lib/excel.ts`、`shared/excelImport.ts`、`lib/i18n.ts`、`electron/excel.cjs`；新增 `shared/tags.ts`、`tests/tags.test.ts`；更新 `tests/excel.test.ts`、`tests/storage.test.ts`、`tests/backup.test.ts`。
- 数据层：tags 为新增字段（旧数据缺省 `[]` 无迁移）；subtasks 键名不变。
- AGENTS.md：删除「无标签概念」条目改为标签决策；子任务词汇条目更名；记录编辑器字段顺序。
- 注：同一工作区还包含用户并行的两处 UI 文案改动（编辑抽屉头部删除「状态由系统自动维护」提示、`field.note`/`search.placeholder`「说明」→「备注」），非本变更范围——本变更仅把 Excel 列头与之对齐。

# Tasks（TDD 顺序：先测后实现）

## 1. 标签纯函数与数据层

- [x] 1.1 新建 `src/shared/tags.ts`：`parseTags` / `formatTags` / `normalizeTags`
- [x] 1.2 新建 `tests/tags.test.ts`：分隔符全集（半/全角逗号、顿号、分号、竖线、换行）、trim/去空、按序去重、formatTags 往返、normalizeTags 坏形状（非数组/非字符串元素/嵌套分隔）
- [x] 1.3 `shared/types.ts`：`Task.tags: string[]`（注释：纯展示元数据，不参与状态/筛选）
- [x] 1.4 `stores/useTaskStore.ts`：`emptyTask` 补 `tags: []`
- [x] 1.5 `lib/storage.ts`：`loadTasks` 对 tags 走 `normalizeTags`（缺失/坏形状 → `[]`）；`tests/storage.test.ts` 补用例

## 2. 编辑抽屉与任务卡

- [x] 2.1 `TaskEditor`：「标签」字段（标题之后）——chip + × 删除 + 回车提交（走 parseTags）+ 空 Backspace 删末尾；缓冲区随 `task.id` 重置；`commitAndClose` patch 带 tags
- [x] 2.2 `TaskEditor`：「子任务」改名「待办项」，并与「备注」互换（新顺序：标题→标签→待办项→优先级→执行时间→备注）
- [x] 2.3 `TaskItem`：元信息行标签 chip（优先级标记之后）；子任务文案改「待办项」
- [x] 2.4 `lib/i18n.ts`：新增 field.tags / editor.tagsPlaceholder / editor.removeTag（提示并入 placeholder，无独立 hint 键）；子任务相关值改「待办项」/ To-dos

## 3. Excel 双端

- [x] 3.1 `lib/excel.ts`：任务表「标签」列（HEADERS + 导出 + 导入 + 列宽）；「子任务」sheet/列头改「待办项」，导入兼容旧「子任务」名；桌面 `electron/excel.cjs` 同步
- [x] 3.2 `shared/excelImport.ts`：`comparable` 增 tags
- [x] 3.3 `tests/excel.test.ts`：sheet 名/表头更新、标签列往返、旧「子任务」表兼容

## 4. 验证与收尾

- [x] 4.1 `pnpm test` 全绿 + `pnpm typecheck` 通过
- [x] 4.2 实现后必审：死代码 / 未接线函数 / 注释与命名一致性；dev 起服务人工核对编辑抽屉字段顺序与标签交互
- [x] 4.3 AGENTS.md：标签决策（替换「无标签概念」）、「待办项」词汇、编辑器字段顺序

## 5. 实现后复审修正（2026-10-09 对抗式复审 workflow：4 维度 × 每条两票反驳验证）

- [x] 5.1 【critical】备份恢复路径补 tags 归一：`importTasks`（replace/merge）按 `normalizeTags` 清洗——旧快照无 tags 字段，原样进 store 会让 TaskItem `task.tags.map` / TaskEditor / 浏览器端导出全线崩溃白屏（loadTasks 之外唯一整批写入入口）；`tests/backup.test.ts` 加回归
- [x] 5.2 【major】`hasTagsColumn` 语义：旧导出文件无「标签」列时「更新匹配」保留存量标签（未提及 ≠ 清空）、标签不参与变化比较；`parseTasksFromWorkbook` 检出列存在性 → `importExcelTasks({ incomingHasTagsColumn })` → `planExcelImport`；`tests/excel.test.ts` 加双向用例
- [x] 5.3 【major】标签/待办项输入框 Enter 补 `isComposing` 守卫：中文输入法确认候选的 Enter 不提交（与 SearchBox 同款）
- [x] 5.4 【minor】Excel 任务表列头「说明」→「备注」（对齐 UI 词汇；导入 pick 别名已同时认「说明」「备注」，旧文件不受影响）
- [x] 5.5 【minor】tasks.md 2.4 措辞修正（无 editor.tagsHint 键）+ proposal 补记工作区并行用户改动

## 6. 迭代 4（2026-10-09 晚：内部标识符全量正名，用户要求代码不留 subtask 词汇）

- [x] 6.1 `Subtask`→`Todo`、`Task.subtasks`→`todos`、store 四动作→addTodo/toggleTodo/renameTodo/removeTodo、`SubtaskPanel`→`TodoPanel`、`SUBTASK_*`→`TODO_*`、局部变量（subDraft/subDone/hasSubs/subId/sub-draft 前缀）全量更名
- [x] 6.2 数据迁移：`loadTasks`/`importTasks` 把旧 `subtasks` 键折转到 `todos`（`normalizeTodoItems` 归一 + 旧键剥离）；`electron/excel.cjs` 双读 `todos ?? subtasks`（主进程直读磁盘）
- [x] 6.3 迁移测试（storage：旧键折转+坏条目剔除+旧键剥离；backup：旧快照恢复迁移）；全量测试 + typecheck；AGENTS.md 更名条目改写

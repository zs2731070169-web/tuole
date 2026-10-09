# 任务分组：独立单值字段（取代「标签即分组」过渡方案）

## Why

用户质疑（2026-10-09）：标签（自由多值标注）与分组（互斥归类、日历成块识别）被混为同一概念不合适——多标签时颜色取决于输入顺序而非语义、标签词表大导致 10 档色板碰撞误导、为凑颜色污染标签。经选项确认，用户选定**独立「分组」字段**（类 Google Calendar：一任务一组，组有颜色）。

**取代关系**：同日早前的 `tag-group-colors` 变更（首标签定色）整体废弃——标签回归中性 chip；`shared/tagColors.ts` 更名扩展为 `shared/groups.ts`，CSS `tag-tone-*` 更名 `group-tone-*`。

## What Changes

- **契约**：`Task.group: string | null`（单值、null = 无分组不着色）；`loadTasks` 与 `importTasks`（备份恢复入口）经 `normalizeGroup` 归一（非字符串/空白 → null，合法值 trim）。
- **编辑抽屉**：「分组」字段插在标题之后——已选分组 chip（分组色）+ × 清除、输入回车提交（isComposing 守卫、空框 Backspace 清除）、存量分组建议 chips（`collectGroupVocabulary` × `matchGroupSuggestions`：前缀筛、已选剔除、空输入全量浏览）；全缓冲随「保存」原子落库。标签 chip 恢复中性色、联想列表恢复 Tag 图标。
- **着色**：`groupColorIndex`（djb2 % 10）→ `group-tone-0..9`（styles.css 明暗双套、chroma 压低）——同分组永远同色、免配置、无颜色设置入口（有意设计）。接线互为锚点：日历格内 chip 与「+N 更多」浮层（`calendarChipTone`：仅活动任务 today/upcoming 着色，**逾期/已完成/未安排仍走状态色——状态语义优先于分组**）、任务卡元信息行分组 chip（优先级后、标签前）。
- **Excel**：任务表「分组」列（标签之后，日期列号右移至 8/9），浏览器/桌面双端同构；`hasGroupColumn` 与标签同款「缺列 = 未提及 → 更新匹配保留存量、不参与变化比较」语义。

## Impact

- 文件：`shared/types.ts`、`shared/groups.ts`（新，取代 tagColors.ts）、`styles.css`、`stores/useTaskStore.ts`、`lib/storage.ts`、`features/tasks/TaskEditor.tsx`、`components/TaskItem.tsx`、`components/TaskIOButtons.tsx`、`features/calendar/CalendarView.tsx`、`lib/excel.ts`、`shared/excelImport.ts`、`electron/excel.cjs`、`lib/i18n.ts`；测试：`tests/groups.test.ts`（新）、`tests/tagColors.test.ts`（删）、全部夹具补 `group: null`、excel/storage 用例更新。
- 旧数据：无 group 字段 → null，无迁移；旧快照恢复经 importTasks 归一。
- AGENTS.md：标签条目回退颜色语义、新增「分组」条目、字段顺序与缓冲字段清单更新。

# 标签分组色：同标签任务在日历同色浅填充

## Why

用户需求（2026-10-09）：缺少任务分组维度——希望同一组的任务在日历表格里用同色系浅色填充，扫一眼就能识别同类任务。标签是现成的分组维度，缺的只是「标签 → 颜色」的映射与展示。

## What Changes

- **确定性映射**：新建 `src/shared/tagColors.ts`——djb2 哈希把标签名映射到 10 档分类色（`tag-tone-0..9`，styles.css 明暗双套「浅底深字」，chroma 压低）。同标签永远同色、跨会话稳定、免配置（**无「选颜色」入口，有意设计**）。
- **日历 chip 着色**（格内 chip 与「+N 更多」浮层条目，`calendarChipTone`）：**仅活动任务（today/upcoming）按首标签着色**；逾期/已完成/未安排仍走状态色——**状态语义优先于分组**（欠账红、完结绿不可被分组色淹没）。
- **颜色锚点**：任务卡元信息行的标签 chip、编辑抽屉的标签 chip 与联想列表色点，都用同一色档——让「哪种颜色 = 哪个分组」可学习，而不是无源之水。
- 多标签任务按**首标签**定色（确定性）。

## Impact

- 文件：新增 `src/shared/tagColors.ts`、`tests/tagColors.test.ts`；改 `styles.css`（色板）、`CalendarView.tsx`（chip 着色 + calendarChipTone）、`TaskItem.tsx` / `TaskEditor.tsx`（标签 chip/色点）；AGENTS.md 标签条目补分组色口径。
- 纯展示层，无数据层/筛选语义改动（标签仍不参与筛选/状态机/统计）。

## 废弃说明（2026-10-09 同日）

本变更（首标签定色）上线即被用户质疑「标签与分组混为一谈」，经确认改为**独立单值「分组」字段**——见 `openspec/changes/task-group-field/`。标签回归中性 chip；`shared/tagColors.ts` 更名扩展为 `shared/groups.ts`，CSS `tag-tone-*` 更名 `group-tone-*`。

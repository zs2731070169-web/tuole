# 备注框随内容自动长高

## Why

用户反馈（2026-10-09）：新增/编辑抽屉的备注框固定 3 行且不可拖拽，备注一多只能在小窗里滚动，很不方便。

## What Changes

- `TaskEditor` 备注输入框改为**随内容自动伸缩**：`rows={3}` 为最小高度，effect 里先 `height:auto` 归零再量 `scrollHeight`（删行时才能回缩），封顶 `NOTE_INPUT_MAX_HEIGHT = 256px`、超出转 `overflow-y-auto` 内部滚动——超长备注不会把抽屉其余字段推出视野。
- 挂载即按当前内容定高：打开长备注任务时直接撑开，无需任何手动操作；切换编辑对象随 note 缓冲重置联动。
- 行距放宽 `leading-relaxed`，长文本阅读更舒展。不加手动 resize 拖拽角（尺寸不持久化、重开即丢，自动伸缩已覆盖其全部价值）。

## Impact

- 文件：`src/features/tasks/TaskEditor.tsx`；AGENTS.md 编辑抽屉条目补口径。
- 纯展示层，无数据层改动。

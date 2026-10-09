# 执行时间 picker 默认锚定工作台选中日

## Why

用户要求（2026-10-09）：添加/编辑抽屉的「执行时间」日历弹层，无起始日期时默认翻到**今天**所在月——但工作台可浏览任意选中日（`workbenchDay`），在看别的月份建任务/编辑未安排任务时，日历还得手动翻页才能到目标月。应默认定位到任务当前所属的日子。

## What Changes

- `DateRangeField` 新增可选 prop `anchorDay?: string | null`：无起始日时，日历 `defaultMonth` 用锚点日所在月替代今天；锚点缺失/非法回落今天。有起始日（`draft?.from`）时行为不变（仍锚起始月）。筛选工具行的 `DateRangeInlineFilter` 不传锚点，行为不变。
- `TaskEditor` 传 `anchorDay = task.parkedDate ?? workbenchDay`：未安排任务锚其停靠日（工作台草稿停靠 = 工作台选中日，日历格新建草稿停靠 = 该格日期），其余情况锚工作台当前选中日。
- **新建草稿预填默认值（迭代 2，2026-10-09 用户决策）**：`draft === true` 且无 scheduledDate 时，执行时间缓冲区预填 `parkedDate ?? workbenchDay`（`initialScheduledDate`）——触发器直接显示该日，保存即排期；「清除」回未安排、清除后保存落「未安排」卡。仅缓冲区预填：store 里草稿仍无 scheduledDate（关闭丢弃），编辑已有任务不预填。
- 日历视觉锚定只对「仍无起始日」的场景生效（编辑已有未安排任务等），与预填互不冲突。

## Impact

- 文件：`src/components/DateRangeField.tsx`（anchorDay + 锚点月计算）、`src/features/tasks/TaskEditor.tsx`（接线）；AGENTS.md 编辑抽屉条目补一句。
- 纯展示层定位变化，无数据层/测试口径改动；回归入口 = 既有全量测试 + typecheck。

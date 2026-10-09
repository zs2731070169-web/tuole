# 复制按钮的副本落「未安排」

## Why

用户要求（2026-10-10）：复制某一个任务项以后，副本放到「未安排」里，不要放到「进行中」——与同日「未开始一律停未安排、禁止擅自进进行中」的定调一致（副本是新的未开始执行，不该直接出现在进行中栏）。

## What Changes

- `duplicateTask(id, parkedOn?)`：内容克隆（标题/备注/优先级/分组/标签/待办项换 id 清 done、完成态清空、身份全新、插入源紧后）后，**执行期清空、停靠 `parkedOn` 兜底今天**；日历「+N 更多」浮层的复制按钮传浮层所属日。归位由用户拖拽/编辑完成。
- ⌥ 拖拽复制（`duplicateTaskToDay`）不受影响：单日副本落目标日；目标为未来日时按既有「未开始暂存未安排」口径呈现。
- 文案 `action.duplicate` → 「复制（副本进入未安排，拖拽归位）」。

## Impact

- `useTaskStore.duplicateTask`、`CalendarView`（传 key）、`i18n`；`tests/duplicateTask.test.ts` 断言更新 + parkedOn 用例。

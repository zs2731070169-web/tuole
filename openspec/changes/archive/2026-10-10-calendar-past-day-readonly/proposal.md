# 日历今天之前的格子仅查看：不跳工作台、不新建

## Why

用户要求（2026-10-10）：日历格子添加约束——点击**当天之前**的格子不允许跳转到工作台，也不允许新建任务。过去日是历史查看面（已完成/逾期欠账），不应成为工作上下文的落点；在过去日上新建任务（或被静默改到今天）都违背直觉。

## What Changes

- **跳工作台的三条路径全部加 `key < today` 守卫**（`CalendarView.tsx`）：格子两段式点击的第二下、格内任务 chip 点击（格已选中时）、「+N 更多」浮层条目点击。过去日第一下**仍可选中**（选中是查看视角，非动作）；悬停浮出的「+N 更多」清单照常可看（条目点击只收起浮层、不跳转）。
- **新建按钮禁用**（`ViewToolbar.tsx` 的 `NewTaskButton`）：日历视图选中过去格时按钮灰化（`aria-disabled` + `cursor-not-allowed`，非原生 `disabled`——保住 title 悬停说明），点击无操作；**废弃该场景下「回退今天」的静默换目标**。新增 i18n 键 `action.newPastDay`。
- **不受影响的路径**（刻意保留）：删除模式选过去日（清理历史是合法操作）；把任务拖入过去格（改期成欠账，与工作台「拖入逾期」同语义）；chip 从过去格拖走迁移。

## Scope 边界（刻意不动）

- 工作台视图选中过去日 + 新建：维持既有「回退今天」口径（本次约束只针对日历格子）。
- 工作台自身经 `WorkbenchDayPicker` 选过去日查看历史：不受影响——被挡住的只是「从日历进入过去日工作台」的入口。

## Impact

- `src/features/calendar/CalendarView.tsx`（三处守卫 + 注释）；`src/components/ViewToolbar.tsx`（NewTaskButton）；`src/lib/i18n.ts`（新键）；AGENTS.md 三处口径。

## 迭代（2026-10-10 同日二次收紧：过去格不接收拖放）

用户追加要求：今天之前的格子也不允许**复制粘贴或移动到这里**。此时复制粘贴 = ⌥(Alt)+拖 chip/浮层条目落到目标格（`duplicateTaskToDay`，单日副本），移动 = 普通拖（`moveTaskDay`）——两者共用格子 `onDragOver`/`onDrop`，且是全应用唯一「落到某一天」的 UI 路径（已 grep 确认）。实现 = 该对守卫追加 `key < today`：dragover 不 preventDefault（无高亮、系统 no-drop 光标）、drop 直接 return，与「拖到自己执行期内」的无效反馈同款契约。工作台「拖入顶部逾期目标 = 排到昨天」是另一 surface 的显式欠账入口，刻意不受影响；浮层内「复制」按钮（原地克隆、副本落源任务同日期）是「从这里复制」而非「到这里粘贴」，不属本次约束（如需禁掉过去日条目的原地克隆另行决策）。拖拽开始即写 store（draggingStatus/draggingTaskId）触发重渲染，drop 时的 `today` 必然新鲜——无跨午夜陈旧窗口。

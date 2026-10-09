# 日历浮层「复制」+ 自由拖拽归位

## Why

用户要求（2026-10-10）：日历格里的任务要能复制。方案经三轮收敛：按钮+选落点弹层被否（多一步慢）、⌥拖拽被否（隐藏手势、触屏无 Alt）；用户定调「**浮层复制 + 自由拖拽，这样更快**」。

**为何复制 + 拖拽不冲突**：副本是全字段等价克隆，在「拖拽 = 单日移动」语义下，拖源或拖副本得到的终态任务集合完全相同（同标题同日期的多重集，任务身份对用户不可见）——不存在「拖错」。

## What Changes

### 1. store（`useTaskStore.duplicateTask(id): Task | null`）

- **原地整条克隆**：title/note/priority/tags/group/scheduledDates/parkedDate 原样；`todos` 逐项换新 id 且 `done` 清零（副本是全新执行）；`completedAt/completedReason` 清空、`draft` 置 false（副本 status 完全由状态机自动派生，不碰状态红线）；`id/createdAt/updatedAt/sortOrder` 全新（`updatedAt=now` 天然满足「当天提醒时刻后新建当天不提醒」）；集合字段浅拷防共享引用。
- **插入源任务紧后**（数组序 = 日历格/概览展示序）：副本行与源行相邻呈现即复制反馈，无需 toast。
- 源不存在返回 `null` 不落库。单测锚定（tests/duplicateTask.test.ts）。

### 2. UI（`CalendarView` 日清单浮层行）

- 行结构从单 `<button>` 改为 `group/row` 容器：标题按钮（`flex-1 truncate`，点击跳工作台语义不变）+ 行尾「复制」图标按钮（lucide `Copy`）。
- 复制按钮：hover 显现（`group-hover/row:opacity-100`）、触屏常显（`max-[640px]:opacity-100`）；`onPointerDown` 阻断冒泡（点复制不武装行拖拽）、`onClick` 阻断冒泡 + `duplicateTask`；浮层保持打开（列表即时多出相邻副本行）。
- `chipDragProps` 上移到行容器（拖拽载荷与「只动被拖那一天」落点契约不变）。

### 3. i18n

- `action.duplicate`（zh「复制」/ en "Duplicate"），aria-label/title 复用。

## 不改动 / 红线

- 拖拽通道保持纯移动（`moveTaskDay`）；不引入 ⌥ 拖拽、不做选落点弹层、不做「仅当天截断」复制。
- 复制非破坏性：无 ConfirmDialog（确认红线只管删除）。
- 草稿不可达（浮层本就只列 views）；已完成任务可复制（副本回活动态，「做完的事再来一遍」）。
- 状态红线：副本不携带任何完成态/draft，status 全自动派生。

## Impact

- `src/stores/useTaskStore.ts`（+1 action）、`src/features/calendar/CalendarView.tsx`（浮层行结构）、`src/lib/i18n.ts`（+1 键）、`tests/duplicateTask.test.ts`（新）。
- 无数据契约/存储/Excel 改动。

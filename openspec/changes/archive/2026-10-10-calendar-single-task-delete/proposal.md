# 日历单任务删除：chip / 浮层条目行尾直接给删除入口

## Why

用户反馈（2026-10-10）：删除日历格子里的单个任务要走「点按日期删除 → 选格子 → 点删除」三步，太繁琐——单个删除没必要进批量删除模式。应当直接放置删除按钮，指到哪个任务就可以删除哪个。背景张力：过去日「仅查看」约束封掉了跳工作台路径后，过去日任务的唯一删除入口只剩按日期删除模式，摩擦被放大。

## What Changes

- **格内 chip 行化改造**（`CalendarView.tsx`）：chip 从单一 `<button>` 改为行容器（`chipDragProps` 上移容器，与「+N 更多」浮层行同构）= 标题按钮（原两段式点击/过去日守卫/删除模式转发语义逐字保留）+ 行尾 **hover 显现的 🗑 删除钮**（触屏 ≤640px 常显）。删除钮 `onPointerDown`/`onClick` 双阻断冒泡——不武装行拖拽、不触发标题点选、不触发格子两段式。
- **浮层条目行**：在「复制」旁并排加 🗑（destructive hover 色）；确认弹窗（根节点 ConfirmDialog）传送门在浮层之外，点「删除/取消」经 Radix 外部关闭顺带收起浮层，属预期（删除流已完结）。
- **共享 `deleteCalendarTask`**：确认文案 `confirm.deleteTask`（带 {title}）→ `deleteTasks([id])` → 从 `selectedIds` 过滤移除——与工作台 TaskItem 行内删除**完全同口径**（必须走应用内 AlertDialog，禁止 window.confirm）。
- **删除模式下隐藏格内单删钮**（该模式按天圈选，不给并行动词）；浮层本身在删除模式不渲染，天然无此问题。
- **过去日照常可删**：过去日「仅查看」约束封的是跳转/新建/落放；删除是合法的历史清理动作（本需求主场景正是清理过去日任务）。

## 几何红线

- chip 行高不突破 92px 格的既有预算：删除钮 `size-4`（16px）< 标题行高（约 17.75px），flex 行高度不变；标题按钮 `min-w-0 flex-1 truncate`（悬停期标题多截一点，行宽吸收）。
- 行容器 `flex` 显式 display——`space-y-1` 垂直流内不引入行盒 strut（既有 Lesson）。

## Impact

- `src/features/calendar/CalendarView.tsx`（chip 行化 + 浮层删除钮 + 共享删除流）；AGENTS.md 删除入口口径（两处 → 三处）与 chip 行结构说明。

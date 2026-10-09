# Tasks

- [x] 1. 格内 chip 行化：`chipDragProps` 上移 group/chip 容器，标题按钮保留原 onClick 全语义（两段式/过去日守卫/删除模式转发），行尾 hover 🗑（删除模式隐藏、触屏常显、双 stopPropagation）
- [x] 2. 浮层条目行加 🗑（复制旁，destructive hover 色）
- [x] 3. 共享 `deleteCalendarTask`：confirm.deleteTask 确认 → deleteTasks([id]) → selectedIds 过滤清理（与 TaskItem 同口径）
- [x] 4. AGENTS.md 删除入口三处口径 + chip 行结构说明
- [x] 5. typecheck + 全量测试 + `pnpm build` + 对抗性审查（几何预算 / 交互迷宫 / 删除流三视角）

## 迭代（2026-10-10 用户实测反馈：选中了没看到按钮）

纯 hover 显现可发现性差——用户点选格子后找不到删除钮，「选到哪个删哪个」的心智 = 选中即出现。改为：格内删除钮 = hover 显现 ∨ **选中格内常显**（`selectedDay === key` → opacity-100）∨ 触屏常显；浮层条目按钮维持行 hover 显现（浮层本身即显式意图，且与用户自建的复制钮同款）。

## 迭代（2026-10-10 用户实测反馈：只想删 29 号，30 号被连带删）

多天任务（执行期覆盖 29+30）点 29 号 chip 的删除钮走了整条 `deleteTasks`，30 号 chip 一并消失。改为**按日修剪**：store 新增 `deleteTaskDay(id, day)`（`planDeleteDaysPrune` 单任务×单日，与「按日期删除」同源）——多天覆盖该日 → 修剪 scheduledDates 保留任务（updatedAt 落戳同手动编辑口径），确认文案用新键 `confirm.removeTaskDay`（明示「仅从 {date} 移除这一天，其余日期保留」）；单日 / 未安排停靠 / 已完成完成日 → 整条删除（原 `confirm.deleteTask` 文案）；该日不属此任务 → 防御性无操作。chip 与浮层两处调用点都传格子日期。

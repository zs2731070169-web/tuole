# Tasks

- [x] 1. CalendarView 三处跳转路径加 `key < today` 守卫（格子第二下 / chip / 「+N 更多」浮层条目），守卫置于 `dayListWasOpen` 收起守卫之后、跳转调用之前；删除模式分支不受影响
- [x] 2. NewTaskButton：日历选中过去日 → 禁用（aria-disabled + 灰化 + title 说明，点击无操作），日历分支不再回退今天；i18n 新增 `action.newPastDay`
- [x] 3. AGENTS.md 三处口径（两段式点击 / chip 跳转 / 新建目标日）
- [x] 4. typecheck + 全量测试 + `pnpm build` 重建产物（桌面端从磁盘读 dist）+ diff 对抗性审查

## 审查修复（2026-10-10 对抗性审查确认的两项）

- [x] 5. 跨午夜陈旧闸：`pastDayPicked` 是渲染帧快照（todayKey() 渲染期求值，跨午夜静置无 store 写入 → 不重渲染），onClick 内改用点击时刻的新鲜 today 复核过去日再放行——防止「昨天的今天」漏过闸停靠成过去日草稿（旧代码的点击时回退曾被本次改动删除）
- [x] 6. 禁用原因并入 aria-label：title 读屏默认不播报、键盘聚焦不显示气泡，悬停说明只覆盖鼠标通道；禁用态 aria-label = 「新建任务，过去日期不能新建任务」

- [x] 7. 二次收紧（2026-10-10）：格子 onDragOver/onDrop 追加 `key < today`——过去格不接收移动与 ⌥ 复制粘贴（grep 确认该对 handler 是全应用唯一落日路径）；AGENTS.md 两段式条目 + 拖放契约补口径；typecheck + 测试 + 重建产物

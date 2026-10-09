# Tasks

- [x] 1. `DateRangeField` 增 `anchorDay` prop：无起始日时 `defaultMonth` 锚到该日所在月（缺失/非法回落今天），双月/单月两个 Calendar 同步
- [x] 2. `TaskEditor` 接线：`anchorDay = task.parkedDate ?? workbenchDay`（未安排任务锚停靠日，其余锚工作台选中日）
- [x] 3. `pnpm test` + `pnpm typecheck` 全绿；AGENTS.md 编辑抽屉条目补锚点口径（勿回落今天、勿做预选）

## 迭代（2026-10-09 用户截屏纠错：同月不可见）

- [x] 4. 仅锚月份在「工作台日与今天同月」时不可见——用户感知的「默认所选」是**天级高亮**（DayPicker 的 today 浅底块，截屏里落在 9 号真实今天）。修正：无起始日时同时覆写 `today` 属性为锚点日，高亮落到工作台/停靠日；一旦选定起始日，恢复真实今天高亮。仍是纯视觉定位，不向缓冲区预写日期。

## 迭代 2（2026-10-09 用户截屏追问：执行时间没有默认值）

- [x] 5. 新建草稿（`draft === true` 且无 scheduledDate）的执行时间**缓冲区预填默认值** = `parkedDate ?? workbenchDay`（`TaskEditor.initialScheduledDate`，挂载与切换编辑对象同口径）：触发器直接显示该日、保存即排期到该日；「清除」回未安排后保存落「未安排」卡。编辑已有任务不预填。store 数据不变（草稿仍无 scheduledDate，关闭整条丢弃）。

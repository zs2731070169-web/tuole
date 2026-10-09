# 执行期模型改造：起止区间 → 日期集合

## Why

用户三轮反馈（2026-10-09 深夜定调）：日历里跨多天任务的拖拽应当「**只动被拖那一天，其他天完全不动**」。连续区间模型（scheduledDate/dueDate）下该语义不可表达——无论整段平移（迁出其他格子）还是端点延长（拉出长跨度，用户截屏实测 19 天怪物跨度）都不符合。经选项确认选择「只动被拖那一天」，接受执行期可分散的数据模型改造。

## What Changes

- 契约：`Task.scheduledDates: string[]`（排序去重、可分散；空 = 未安排）。`storage.ts` 迁移单点展开旧区间并剥离旧键；`reminder.cjs` 只读双读。
- 纯函数（taskDates.ts 重写）：`scheduledOnDay`=includes、`firstScheduledDay`/`lastScheduledDay`（=旧 scheduleEnd）、`movedSchedule` 整体平移（工作台/顺延语义保留）、`movedDay` 逐日移动、`isContiguousDays`、`expandLegacySpan`、`normalizeScheduledDays`；`draggedSchedule`（延长端点）废弃删除。
- 日历拖拽：chip 携带 `text/task-source-day`，drop = `moveTaskDay(源日→目标日)`；覆盖期落点 gate 不变（无效放置）。
- 状态机/分桶/筛选/统计/excelScope：首末日分区 + includes 覆盖，签名不变自动适配。
- 编辑抽屉：连续走区间（替换语义）、分散走日期 chips（× 移除）+ 区间重设；任务卡分散显示「首日 等 N 天」。
- Excel 双端：连续 = 首/末两列（旧格式兼容），分散 = 安排日期列顿号全列表；导入多值解析；comparable 含集合。

## Impact

- 全链路（types/storage/taskDates/statusMachine/store/CalendarView/TaskItem/TaskEditor/excel×2/excelImport/reminder.cjs/backup 校验/filter 排序）；测试夹具全量迁移 + 新增 movedDay/迁移/连续性用例（196 项）。
- 用户现存的 19 天「需求验证」任务迁移后仍是 19 个日期，可在编辑抽屉重设区间修正。

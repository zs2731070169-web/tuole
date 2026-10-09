# Tasks

- [x] 1. types + taskDates 重写 + 状态机 + storage 迁移单点（expandLegacySpan/normalizeScheduledDays）
- [x] 2. store：scheduleTo=整体平移、moveTaskDay=逐日移动、rollOver 适配；init 未安排判定
- [x] 3. 日历：未安排判定、chip 源日载荷、drop=moveTaskDay、覆盖期 gate 保留
- [x] 4. 编辑抽屉（连续区间/分散 chips）+ 任务卡元信息（连续箭头/分散 等 N 天）+ filter 排序 + backup 校验 + calendar.ts
- [x] 5. Excel 双端（连续首末/分散全列表 + 多值导入）+ excelImport comparable + reminder.cjs taskDays 双读
- [x] 6. 测试夹具全量迁移 + movedDay/迁移/连续性新用例：196/196 全绿、typecheck 通过
- [x] 7. AGENTS.md 置顶决策章节；重建 dist 与 妥了.app

# Tasks（先测后实现）

- [x] 1. `tests/groups.test.ts`：色档确定性/范围/分布冒烟、groupToneClass 空值回退、normalizeGroup（非字符串/空白→null、trim）、词表去重保序、建议匹配（前缀/已选剔除/空 draft 全量）
- [x] 2. `shared/groups.ts`（取代 tagColors.ts）+ styles.css `tag-tone` → `group-tone` 更名；types/store/storage/importTasks 接 group 归一；全部测试夹具补 `group: null`
- [x] 3. TaskEditor「分组」字段（标题后）：chip+×、回车提交、建议 chips、isComposing/Backspace、全缓冲、commit patch；标签 chip 恢复中性、联想恢复 Tag 图标；i18n field.group/groupPlaceholder/removeGroup
- [x] 4. CalendarView `calendarChipTone` 按 task.group；TaskItem 分组 chip（groupToneClass）+ 标签回 muted
- [x] 5. Excel 双端「分组」列（日期列号 8/9）；excelImport `incomingHasGroupColumn`（缺列保留存量、不参与比较）；TaskIOButtons 接线；tests 更新 + 分组往返/保留用例
- [x] 6. AGENTS.md（标签回退 + 分组新条目 + 字段顺序）与 OpenSpec 记录；`pnpm test` + typecheck 全绿；重建 dist 与 妥了.app

# Tasks（先测后实现）

- [x] 1. `tests/date.test.ts` 新增：workbenchDateLabel（今天保留 / 明天/昨天/远期一律绝对 / en「Oct 8」/ 空值）、friendlyDate 英文绝对分支回归（曾渲染中文「M月d日」字面量）
- [x] 2. `src/lib/date.ts`：新增 `absoluteDateLabel` + `workbenchDateLabel`（带 now 参数可测）；`friendlyDate` 绝对分支改走 `absoluteDateLabel`（en 存量 bug 顺带修复）
- [x] 3. `TaskItem` 四处锚点（安排日/截止箭头/停靠日/完成于）换用 `workbenchDateLabel`；SingleDateField 保持 friendlyDate
- [x] 4. `pnpm test` 全绿 + `pnpm typecheck` 通过；AGENTS.md 元信息行条目补口径

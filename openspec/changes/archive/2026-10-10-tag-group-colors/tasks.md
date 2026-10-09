# Tasks（先测后实现）

- [x] 1. `tests/tagColors.test.ts`：确定性（同标签同档）、档位范围、样本分布冒烟（≥4 档）、tagToneClass 空值回退
- [x] 2. `src/shared/tagColors.ts`：`TAG_COLOR_COUNT` / `tagColorIndex`（djb2 % 10）/ `tagToneClass`
- [x] 3. `styles.css`：`tag-tone-0..9` 明暗双套色板（浅底深字、低 chroma）
- [x] 4. `CalendarView`：`calendarChipTone`（活动任务按首标签着色，状态色优先）接入格内 chip 与 +N 更多浮层
- [x] 5. `TaskItem` 标签 chip、`TaskEditor` 标签 chip 与联想色点接同色档（颜色↔分组锚点）
- [x] 6. `pnpm test` 全绿 + `pnpm typecheck` 通过；AGENTS.md 标签条目补分组色口径；重建 dist 与 妥了.app

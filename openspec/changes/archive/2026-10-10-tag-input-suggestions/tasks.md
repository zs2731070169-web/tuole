# Tasks

## 1. 纯函数（TDD 先行）

- [x] 1.1 `collectTagVocabulary(tasks)`：收集去重、按首次出现顺序（tests/tags.test.ts）
- [x] 1.2 `matchTagSuggestions(vocabulary, draft, exclude)`：空 draft 全量、前缀大小写不敏感、exclude 大小写不敏感剔除、无匹配空数组（tests/tags.test.ts）
- [x] 1.3 `pnpm test` 全绿

## 2. 编辑抽屉联想 UI

- [x] 2.1 词表 useMemo（订阅 store 原始 tasks）+ 候选 useMemo（词表 × tagDraft × 已加 tags）
- [x] 2.2 候选列表浮层：listbox 语义、tabIndex=-1、悬停同步高亮、点击带出（mousedown preventDefault）、失焦收起、无匹配不渲染
- [x] 2.3 键盘：↑↓ 循环高亮 + Enter 带出高亮项（无高亮走 parseTags 原路径）+ Esc 关闭 + isComposing 全守卫 + 高亮项 scrollIntoView(nearest)
- [x] 2.4 i18n `editor.tagSuggestions` aria 键（zh/en）
- [x] 2.5 `pnpm typecheck` + `pnpm test` + `pnpm build` 全绿

## 3. 收尾

- [x] 3.1 AGENTS.md 标签条目增补联想口径（候选源=存量词表、键盘语义、勿加预置库）

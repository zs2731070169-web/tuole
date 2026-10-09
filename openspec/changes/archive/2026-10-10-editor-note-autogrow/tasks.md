# Tasks

- [x] 1. `TaskEditor`：`NOTE_INPUT_MAX_HEIGHT` 常量 + `[note]` effect（auto 归零 → 量 scrollHeight → min 封顶），textarea 挂 ref、`overflow-y-auto`、`leading-relaxed`
- [x] 2. `pnpm test` 全绿 + `pnpm typecheck` 通过；AGENTS.md 编辑抽屉条目补「备注自动伸缩、勿改回固定 rows」口径

## 迭代（2026-10-09 用户要求：去掉侧边滑条）

- [x] 3. 移除 256px 封顶与 `overflow-y-auto`：备注框随内容**无上限**长高，超出部分由抽屉本体滚动承接——框内无嵌套滚动区，侧边滑条不复存在

## 迭代 2（2026-10-09 用户实测滑条仍在：两处残留根因）

- [x] 4. **border-box 测量缺陷**：`scrollHeight` 不含上下边框，高度少算 2px → 内容永久溢出 2px、textarea 内常驻「长滑块细滑条」——高度改为 `scrollHeight + 上下边框厚度`，textarea 叠 `overflow-hidden` 双保险
- [x] 5. **抽屉本体滑条**：styles.css 新增 `scrollbar-none` 工具类（`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`），挂到编辑抽屉滚动区——滚轮/触控板照常滚，滑条完全不绘制

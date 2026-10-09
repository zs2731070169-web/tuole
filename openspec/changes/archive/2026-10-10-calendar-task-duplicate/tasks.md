# Tasks

## 1. store（TDD 先行）

- [x] 1.1 `duplicateTask(id)`：字段全量克隆 + 身份/时间戳全新 + todos 换 id 清 done + 完成态清空 + 插入源紧后（tests/duplicateTask.test.ts）
- [x] 1.2 未安排任务保持停靠日；不存在 id 返回 null 不落库（同上）
- [x] 1.3 `pnpm test` 全绿

## 2. UI + i18n

- [x] 2.1 浮层行改 group/row 容器：标题按钮（flex-1）+ 行尾复制图标按钮（hover 显现/触屏常显/指针事件阻断冒泡）；chipDragProps 上移行容器
- [x] 2.2 i18n `action.duplicate`（zh/en）
- [x] 2.3 `pnpm typecheck` + `pnpm test` + `pnpm build` 全绿

## 3. 收尾

- [x] 3.1 AGENTS.md 增补复制口径（等价副本终态论证、勿回选落点弹层/⌥拖拽）

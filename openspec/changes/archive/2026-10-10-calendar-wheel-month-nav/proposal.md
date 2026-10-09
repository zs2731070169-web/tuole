# 日历滚轮切月

## Why

用户需求（2026-10-10）：日历界面支持鼠标滚轮上下滑动切换月份表格——与既有拖拽导航互补（不挪鼠标即可翻月）。

## What Changes

- 视口挂**原生非 passive** wheel 监听（React 合成 wheel 在根上是 passive、preventDefault 失效）；卸载回收。
- 触发节流：累计 |deltaY| ≥ 60 + 450ms 冷却 + 300ms 手势重置——鼠标滚轮一格即切一月、触控板轻扫累积触发、余波不连切。
- 优先级：`[data-radix-popper-content-wrapper]` 浮层（+N 更多列表）内滚动归浮层；`.calendar-cell-scroll` 格内滚动区未到边界时归格子，到边界顺势切月；拖拽手势/滑动动画进行中忽略。
- 切月动画复用从拖拽松手抽出的 `slideToMonth(dir)` 原语（260ms 无缝换锚，行为与拖拽完全一致）。

## Impact

- `CalendarView.tsx`（slideToMonth 抽取 + wheel 监听 + 视口 ref）；AGENTS.md 轮播条目补口径。纯交互层，无数据/测试口径改动。

# 时间投入柱改 SVG 整数几何渲染（两轮「发虚」实测的根治）

## Why

用户两轮截屏实测（18:46 / 18:55）：HTML 百分比柱先因半透明发虚（已改实心），实心后**边缘仍软**。根因是亚像素几何——`flex-1` 平分容器产生非整数柱宽、百分比高度产生非整数像素，柱边落在物理像素中间被抗锯齿涂成渐变；该用户显示器对细线渲染本就偏软（与此前圆环毛边同现象族，见 memory「用户屏幕渲染伪影」）。

## What Changes

- **柱图渲染层换 SVG**：实测容器宽度（ResizeObserver）→ 整像素计算柱宽/间隙/x/y/高（`Math.floor`/`Math.round`），`shapeRendering="crispEdges"` 关闭抗锯齿——边线精确落在像素边界。余宽居中，杜绝最后一根柱的分数残差。
- **视觉规则不变**：有值柱实心 `var(--status-today)`；今天 = 实心 + 1px foreground 描边框（原 ring 的清晰化等价物）；今天零投入 = 低透明短柱 + 同色描边；零值/未来 = muted 占位短柱。
- **交互层不变**：绝对定位 HTML 命中 span（与 SVG 柱同宽、全高）逐柱挂 Radix Tooltip，三态气泡（时长/无投入/未到）与工艺（delayDuration=0 + disableHoverableContent）原样保留；`tabIndex={-1}`。
- **去掉高度过渡动画**（SVG rect 属性几何不走 CSS 过渡，清晰度优先于入场动画）。
- 柱下两端日号锚点不变。

## Impact

- 文件：`components/InsightsPanel.tsx`（柱区重写为 SVG + 命中层）；统计口径/tests 零变化；AGENTS.md 洞察条目补渲染口径（勿改回百分比 div 柱）；memory「用户屏幕渲染伪影」补此案例。

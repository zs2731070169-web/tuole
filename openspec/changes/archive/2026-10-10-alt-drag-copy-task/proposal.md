# ⌥(Alt)+拖拽 = 复制（日历 chip 单手势路径）

## Why

用户提议（2026-10-10）：拖拽手势直接复制（原始提案为右键拖拽）。**右键在浏览器 HTML5 DnD 里不可用**——`dragstart` 只认主键、右键保留给 contextmenu；自研 Pointer Events 第二套拖拽管线代价高且 macOS 无右键拖拽习惯，已否。用户选定等效的平台原生方案：**⌥(Alt)+拖 = 复制**（Finder 同款）。与已实现的浮层「复制」按钮互补：按钮管触屏/可发现性，⌥拖管熟练用户单手势高速路径。

## What Changes

1. **store** `useTaskStore.duplicateTaskToDay(id, toDay)`：**单日副本**——克隆口径与 `duplicateTask` 同源（新提取 `buildTaskClone` 共用），副本执行期只落目标日一天，源任务零改动，插入源紧后。
2. **CalendarView**：
   - `chipDragProps.dragstart` 的 `effectAllowed` 从 `"move"` 改 `"copyMove"`（否则 dragover 不允许设 copy，无「+」角标）；
   - 日期格 dragover：`dropEffect = e.altKey ? "copy" : "move"`——修饰键按压持续触发 dragover，角标实时切换；
   - drop：`e.altKey` → `duplicateTaskToDay`，否则既有 `moveTaskDay`（只动被拖那一天）；own-span 门控/清拖拽态/关闭浮层等防御两模式共用。

### 修订（2026-10-10 用户实测后当日改）

首版落点语义为「克隆整条 + 锚定被拖日整体平移」（`shiftedDaysAnchored`）。实测否决：源任务散列 [12,14]、⌥拖 14 的 chip 到 16 → 副本 [14,16]——14 号格冒出重复 chip、副本跨两日，违背「复制这一天到那天」的心智（应用交互语言整体是逐日语义：移动只动那天、按日删除只删那天）。改为**单日副本**（副本 `scheduledDates = [toDay]`），`shiftedDaysAnchored` 已删除，勿回整段平移。

## 不改动 / 红线

- 普通拖 = 移动、⌥拖 = 复制，修饰键即判别器；是否按 ⌥ 在 drop 时刻判定（dragstart 后补按也有效）。
- 落点合法性（own-span 覆盖门控、interactiveDay、删除模式）两种模式同口径，不因复制放宽。
- 浮层「复制」按钮（原地克隆 + 自由拖拽归位）保持不变；触屏无 Alt 仍走按钮。
- 勿做右键拖拽（HTML5 DnD 平台限制，见 Why）。

## Impact

- `src/shared/taskDates.ts`（+1 纯函数）、`src/stores/useTaskStore.ts`（提取 buildTaskClone + 1 action）、`src/features/calendar/CalendarView.tsx`（三处拖拽分流）、`tests/duplicateTask.test.ts`（+4 用例）。

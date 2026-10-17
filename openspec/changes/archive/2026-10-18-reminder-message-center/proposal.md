# 提醒重构：消息中心 + 每日首启摘要（取代固定时间提醒）

## Why

用户需求（2026-10-18，针对设置面板「每日到期提醒」区）：① 从**固定时间提醒**改为**每天首次启动应用时提醒**——已读过的摘要当日后续启动不再提醒；② 提醒**不再直接弹出**（弹窗/音效/系统横幅全部取消），改为右上角**消息查看入口**（设置按钮左边）：点击弹出消息列表小卡片；存在**未读**消息时入口带小红点气泡。

## What Changes

- **新实体 `AppMessage`**（`src/shared/types.ts`）：`{ id, kind: "dailyDigest", dayKey, createdAt, readAt, digest: { todayCount, overdueCount, tasks, hiddenCount } }`。每天至多一条 `dailyDigest`（id = `digest-{dayKey}`，dayKey 即当日去重键）；`tasks` 为任务引用快照 `{ taskId, title }[]`（today 在前 overdue 在后，上限 `DIGEST_TITLE_CAP = 5`，差额记 `hiddenCount`、生成时刻定格）。独立持久化：localStorage `todo.messages.v1` / 桌面 `~/.tuole/messages.json`（`STORAGE_KEYS` + `storage.ts STORAGE_FILES` + `desktopBridge.ts DesktopStorageFile` + `main.cjs` IPC 白名单**四处同步**）。滚动保留最近 `MAX_MESSAGES = 10` 条（按 dayKey 降序）。
- **纯函数 `src/shared/messages.ts`**：`selectDigestViews`（status ∈ today/overdue）、`buildDailyDigest`（双零 → null 不生成空摘要）、`buildDigestMessage`、`unreadMessageCount`；tests/messages.test.ts 锚定。
- **`useMessageStore`**（`src/stores/useMessageStore.ts`，镜像 useNoteStore 形状）：`init`/`persist` 写透 + **`ensureDailyDigest()`**——跨 store 单向读取（useSettingsStore 开关 + useTaskStore.views()，无环）：开关关闭/当日已有消息/聚合为空 → 零副作用；否则生成未读消息前插并 persist（幂等，重复调用安全）+ `markAllRead()` + **`dismissDigestTask(messageId, taskId)`**（点击消费：移除条目并持久化，条目不存在真无操作）。**生成时机三处**：App 启动 effect（initSettings/initTasks 之后）、`reminderEnabled` 切换为开的 effect、scheduler 跨午夜/可见性日变更（长开应用进入新一天也能拿到当天摘要）。当天首启聚合为空则不落消息（当天稍后有内容后的再次启动会补生成——「当天首次有内容的首启」语义，见 spec 取舍）。
- **TopBar 消息中心入口**（`src/components/MessageCenter.tsx`）：Bell 图标按钮（size-11，与设置按钮同量级）置于**设置按钮左边**；未读 > 0 → 右上角红点（bg-destructive，pointer-events-none）；shadcn Popover（传送门 body，no-drag 由既有 CSS 规则覆盖）弹出 w-80 消息卡片：标题「消息」+ 消息项（`friendlyDate` 日期标签 + 「N 项进行中 · M 项逾期」+ 可点击任务引用列表）+ 空态「暂无消息」；定高内部滚动。**打开即全部标记已读**（onOpenChange(true) → markAllRead）——已读后红点即消，后续启动不再提示，直至次日新摘要。
- **摘要任务点击跳转 + 消费（2026-10-18 同日追加需求）**：点击消息内任务条目 = `dismissDigestTask`（从该消息移除条目并持久化；计数行/hiddenCount 保留为当日快照，不回减不回补）+ 任务仍存在时跳工作台——`setView("workbench")` + `setWorkbenchDay(消息 dayKey)`（**不走 openDayInWorkbench**，它记 returnView="calendar" 而来源是顶栏）+ `clearHighlight()` 后 `select(taskId)` 高亮该卡（绕开「唯一选中再点 = 取消」翻转语义）；任务已删除则只消费条目不跳转；跳转同时收起 Popover。
- **设置面板提醒区改造**：保留开关（reminderEnabled）；**删除**提醒时间输入（`ReminderTimeField`/`normalizeReminderTime`）、浏览器「授权系统通知」补充说明与入口；新增说明文案（每日首启生成摘要、右上角消息中心查看）。开启即调 `ensureDailyDigest()`（承接「开启立即可验证」的既有决策）。
- **`Settings.reminderTime` 字段删除**（类型 + DEFAULT_SETTINGS）；`loadSettings` 剥离存量遗留键（同 `fallbackShortcutEnabled` 口径），磁盘副本下次写盘自然清洗。
- **浏览器侧旧管线拆除**：`scheduler.ts` 删 `checkReminders`/`reminderMinutesOfDay`/`normalizeReminderTime`/`requestNotificationPermission`/`firedReminders`/`isTodayAggregate`（死代码）与 60s 轮询；保留跨午夜 + visibilitychange 结算，结算回调改为 `ensureDailyDigest`。**`src/lib/notify.ts` 整文件删除**（toast/音效/系统通知投递链路不复存在；sonner toast 其他功能不受影响）。
- **桌面主进程旧管线拆除**：`electron/reminder.cjs` 与 `electron/reminder-preload.cjs` **删除**；`main.cjs` 移除提醒引擎接线（15s 轮询/唤醒解锁触发/ledger 读写/独立置顶浮窗/afplay 音效/系统通知/浮窗跟随与显示器钳制/`tuole:reminder:close` IPC/settings+tasks 落盘触发 check/before-quit 清理）及只为提醒存在的 `screen`/`powerMonitor`/`spawn` 依赖与 mainWindow 跟踪；IPC 存储白名单 + `messages.json`。**`tests/desktopReminder.test.ts` 删除**（被测模块整体下线）。
- **i18n**：删 `settings.reminderTime`/`reminderOn`（旧文案）/`reminderPermissionHint`/`reminderGrant`；新增 `messages.*` 与新说明键（zh/en 双语）。
- **接线**：`routes/index.tsx` 启动 effect `initMessages()` + `ensureDailyDigest()`、`reminderEnabled` 专用 effect、`onRefresh` 同步 initMessages。

## 不改动 / 红线

- **摘要聚合口径不变**：今天（执行期覆盖今天且已开始）+ 逾期欠账，跳过草稿/未安排/未来/已完成——与旧 reminder.cjs `dueKind` 同语义，但实现收敛到渲染层 `computeAutoStatus` 派生（主进程双读旧键的复制版随之消亡）。
- **消息永不参与**：任务状态机/筛选/统计/Excel/自动备份与恢复（快照仍是任务作用域，已知限制同备忘）；无逐条已读区分渲染、无手动删消息（摘要任务条目的「消费移除」是唯一逐条操作）。
- 「打开消息卡片 = 全部已读」为唯一已读路径；跳转锚定一律消息 dayKey（today 任务落进行中栏；逾期任务经工作台顶部「逾期 N」入口 + 选中高亮可见，不自动展开逾期面板——面板开关是 WorkbenchView 局部态）。
- 提醒弹窗/音效/系统通知/桌面浮窗/ledger **勿复活**；`reminderTime` 字段名勿复活。
- 红点 = **存在未读**（非「存在消息」）——已读消息不构成提示，否则红点永不消。

## Impact

- 新文件：`src/shared/messages.ts`、`src/stores/useMessageStore.ts`、`src/components/MessageCenter.tsx`、`tests/messages.test.ts`、`tests/messageStore.test.ts`、`tests/scheduler.test.ts`（自 reminder.test.ts 收敛生命周期用例改名）。
- 删除：`src/lib/notify.ts`、`electron/reminder.cjs`、`electron/reminder-preload.cjs`、`tests/desktopReminder.test.ts`、`tests/reminder.test.ts`。
- 修改：`src/shared/types.ts`、`src/shared/constants.ts`、`src/lib/storage.ts`、`src/lib/desktopBridge.ts`、`src/lib/i18n.ts`、`src/services/scheduler.ts`、`src/components/TopBar.tsx`、`src/features/settings/SettingsPanel.tsx`、`src/routes/index.tsx`、`electron/main.cjs`、`tests/storage.test.ts`、AGENTS.md、CLAUDE.md。
- 桌面打包版必须重跑 `pnpm desktop:dist`（白名单 +1、主进程管线拆除才会进 app）。

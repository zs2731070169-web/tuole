# Tasks

- [x] 1. 契约：`AppMessage`/`DailyDigestPayload` 类型 + `STORAGE_KEYS.messages` + Settings 删 `reminderTime`（类型 + DEFAULT_SETTINGS + loadSettings 剥离遗留键）
- [x] 2. 纯函数 `src/shared/messages.ts`（selectDigestViews/buildDailyDigest/buildDigestMessage/unreadMessageCount/MAX_MESSAGES）+ tests/messages.test.ts
- [x] 3. 持久化：storage.ts `loadMessages`/`saveMessages`/`sanitizeMessageEntry`（形状清洗 + dayKey 降序 + 滚动 10 条）+ `STORAGE_FILES` 映射 + `DesktopStorageFile` 联合类型 + main.cjs 白名单 + `messages.json`（四处同批）+ tests/storage.test.ts 扩展
- [x] 4. `useMessageStore`（init/persist/ensureDailyDigest 幂等/markAllRead/dismissDigestTask）+ tests/messageStore.test.ts
- [x] 5. scheduler.ts 收敛：删提醒分支与 60s 轮询，跨午夜/可见性结算回调改 `ensureDailyDigest`；删 `src/lib/notify.ts`；tests/scheduler.test.ts（生命周期 + 跨午夜触发生成）
- [x] 6. `MessageCenter` 组件（Bell + 未读红点 + Popover 消息卡片 + 打开即全读 + 任务条目点击跳转/消费）+ TopBar 接线（设置按钮左边）+ i18n `messages.*` 键
- [x] 7. 设置面板提醒区：删时间输入与授权 UI、开关保留并开启即生成、新说明文案；删相关 scheduler 导入
- [x] 8. 桌面主进程：删 reminder.cjs/reminder-preload.cjs 与 main.cjs 全部提醒接线（浮窗/音效/ledger/跟随/唤醒触发/before-quit）+ 只为提醒存在的 electron 依赖；删 tests/desktopReminder.test.ts
- [x] 9. routes 接线：启动 initMessages + ensureDailyDigest、reminderEnabled effect、onRefresh 同步
- [x] 10. 追加需求（2026-10-18 同日）：摘要任务引用化（taskId+title+hiddenCount）+ dismissDigestTask + 点击跳工作台锚定消息日并高亮该卡
- [x] 11. 验证：`pnpm typecheck` + `pnpm test` 全绿（289 项）+ `pnpm build` 通过；多镜头审查工作流按用户指示跳过（2026-10-18）
- [x] 12. AGENTS.md（提醒两节重写为消息中心口径 + 关联措辞同步）+ CLAUDE.md 目录描述同步；归档本 change

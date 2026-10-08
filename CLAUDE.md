# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

AGENTS.md 是本项目行为约束与架构决策的**唯一权威来源**（上文已全文引入）：新增或修改约束时更新 AGENTS.md 即可，本文件无需跟随。

## 常用命令

包管理器固定为 pnpm（有 `pnpm-lock.yaml`），勿混用 npm/yarn。

- `pnpm install` — 安装依赖
- `pnpm dev` — 开发服务器，端口固定 3015（`--strictPort`，Meoo 沙箱只开放该代理端口；HMR 默认关闭，改代码后需刷新页面验证）
- `pnpm build` — 生产构建到 `dist/`（xlsx 依赖导致 chunk >500kB 警告属预期，勿为此改造）
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — Vitest 单次运行 `tests/` 下全部测试（无独立 vitest 配置，复用 `vite.config.ts`）
- 单跑一个测试文件：`pnpm test tests/filter.test.ts`（按文件路径过滤）
- watch 模式（TDD 小步迭代用）：`pnpm exec vitest tests/filter.test.ts`

桌面端（Electron，详细约束见 AGENTS.md「桌面打包」）：

- `pnpm desktop:dev` — vite + electron 联调
- `pnpm desktop:start` — 构建后直跑（主进程内置静态服务器 127.0.0.1:34567 托管 `dist/`）
- `pnpm desktop:dist` — electron-builder 出 `desktop-release/mac-arm64/妥了.app`

注意：
- `tsconfig.json` 的 `include` 只含 `src/**/*` 与 `vite.config.ts`，**`pnpm typecheck` 不覆盖 `tests/`**——测试文件的类型错误只会在 `pnpm test` 运行时暴露。测试沿用相对路径（`../src/...`）导入被测代码的既有约定。
- 跑中的 electron 窗口从磁盘按请求读 `dist/`：`pnpm build` 后窗口 ⌘R 刷新即生效；打包的 `妥了.app` 内置 asar 快照，**必须重跑 `pnpm desktop:dist` 才会更新**（旧 app 永远不会自动跟进，多次因此误判「功能没生效」）。

## Meoo 平台约束（README.md）

本项目从 [Meoo](https://meoo.space) 平台导出，修改后可重新导入：

- 技术栈锁定 react + vite，不要更换框架或构建工具，否则导入时会被拒绝
- 不要删除 `meoo-manifest.json` 与 `.meoo-manifest.json`（同名隐藏文件为平台兼容副本），以及如存在的 `meoo-cloud-snapshot.json`
- 导回平台：打包 ZIP（排除 `node_modules`、`.git`、`dist`）→ Meoo 首页输入框「+」→「导入项目」

## 目录职责与启动链

```
src/
  shared/     纯逻辑与契约：types / statusMachine / filter / workbench / calendar / excelImport / overviewStats / constants（无 React 依赖，被 tests/ 直接覆盖）
  stores/     zustand store：task（数据）/ ui / filter / calendar / settings / confirm
  lib/        无业务状态的工具：date / storage / excel / excelScope / i18n / theme / reveal-engine / desktopBridge（Electron 检测与窄 IPC 桥）
  services/   scheduler.ts（跨午夜 + visibilitychange 状态结算与提醒）/ backup.ts（自动快照引擎）
  features/   按域组织的视图组件：workbench / calendar / tasks(TaskEditor) / settings
  components/ 跨视图复用组件（TaskItem、ViewToolbar、StatusFilterBar 等，行内筛选组内嵌于 ViewToolbar）；ui/ 为 shadcn 生成件，勿手改样式意图
  routes/     TanStack 文件路由；routeTree.gen.ts 由 router-plugin 自动生成，勿手改
tests/        Vitest：statusMachine / filter / workbench / calendar / date / theme / storage / reminder / backup / excel / confirmStore / overviewStats
```

启动链：`main.tsx`（desktop-cursors 桌面端光标标记 + initRevealEngine + cleanupLegacyKeys）→ `routes/index.tsx` 的 App effect（initSettings → initTasks → purgeEmptyDrafts → startScheduler + startAutoBackup；cleanup 对应 stop）。

核心数据流（单向）：localStorage → `storage.ts` → `useTaskStore.tasks`（原始数据，**永不含 status**）→ `computeAutoStatus` 派生 `TaskView[]` → `applyFilters` 筛选 → 视图渲染；写路径上用户动作只改 `scheduledDate` / `completedAt` 等原始字段后 `persist()` 回写。

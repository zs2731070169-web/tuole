<p align="center">
  <img src="docs/banner.svg" alt="妥了横幅" width="720">
</p>

<h1 align="center">妥了 · ToDone</h1>

<p align="center">把任务安排到日子上的本地待办应用：日历排期、逾期不丢、数据 100% 留在本机。</p>

<p align="center">
  简体中文&nbsp;&nbsp;|&nbsp;&nbsp;<a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-F59E0B?style=flat-square" alt="版本 1.1.0">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Web-4B5563?style=flat-square" alt="平台 macOS 与 Web">
  <img src="https://img.shields.io/badge/data-100%25%20local%20%26%20offline-0891B2?style=flat-square" alt="数据 100% 本地离线">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22C55E?style=flat-square" alt="许可证 MIT"></a>
  <img src="https://img.shields.io/github/stars/zs2731070169-web/tuole?style=flat-square" alt="GitHub stars">
  <img src="https://img.shields.io/github/issues/zs2731070169-web/tuole?style=flat-square" alt="GitHub issues">
</p>

## 特性亮点

| 亮点 | 对你的意义 |
|---|---|
| 纯本地、离线可用 | 无账号、无云同步、不上传；浏览器数据留在浏览器本地，桌面数据是 `~/.tuole/` 下可直接阅读的 JSON |
| 按日期组织的一切 | 日历月视图排期、工作台按天聚焦、概览看全貌——三个视图共用同一套任务数据 |
| 逾期任务绝不静默消失 | 错过的任务一直留在视野里，直到你改期或完成——欠账永远摆在眼前 |
| 任何覆盖性操作前都有滚动快照 | 自动备份保留最近 10 份；替换导入、恢复前必先留恢复点 |
| 每日提醒开箱即用 | 每天一个时刻汇总提醒「今天到期 + 逾期」任务；未授权系统通知也有应用内弹窗与提示音兜底 |

## 界面截图

**概览** — 总览统计、30 天完成节奏、可筛选的完整列表：

<img src="docs/screenshots/overview.png" alt="概览：统计卡、状态筛选与任务列表" width="880">

**日历** — 按住上下拖拽切月的月视图，未安排任务停留在停靠日格：

<img src="docs/screenshots/calendar.png" alt="日历：按日期组织的任务卡片月网格" width="880">

**工作台** — 聚焦某一天的 未安排 / 进行中 / 已完成 三栏，逾期面板按需打开：

<img src="docs/screenshots/workbench.png" alt="工作台：未安排、进行中、已完成三栏" width="880">

## 快速安装

环境要求：Node.js 18+ 与 [pnpm](https://pnpm.io)。

```bash
git clone https://github.com/zs2731070169-web/tuole.git
cd tuole
pnpm install
```

- **网页版**：`pnpm dev`，打开 http://localhost:3015
- **macOS 桌面版**：`pnpm desktop:dist`，运行 `desktop-release/mac-arm64/妥了.app`（Apple Silicon）

## 快速上手

1. 打开应用，落在**概览**视图。
2. 切到**工作台**，点**新建任务**，填标题（必填，字段带红色星号）后保存——可顺便打**标签**、加**待办项**；任务以「未安排」状态出现。
3. 点任务行内的**安排**把它排到选中日；日期一到，**完成**按钮自动出现。
4. 错过了日期？任务变红成为「逾期」，一直保留，直到你改期或完成它。

## 任务状态一览

状态由日期自动计算，无需手动维护——「完成」按钮会在日期到达时自己出现：

| 状态 | 含义 |
|---|---|
| 未安排 | 还没选日期——新建后的默认状态 |
| 即将到来 | 已安排在未来某天 |
| 今天 | 安排日已到 |
| 逾期 | 过了安排日未完成——不会消失，等你处理 |
| 已完成 | 点「完成」或拖入已完成栏 |

## 三个视图

| 视图 | 用来做什么 |
|---|---|
| **概览** | 看全貌：总量、本周与近 30 天完成、节奏图、分页的完整列表 |
| **日历** | 看排期：拖拽网格切月，悬停「+N 更多」看某天完整清单，两次点击某天直接跳入 |
| **工作台** | 聚焦一天：在栏之间拖拽任务完成排期、结束或取消安排；右上角计数打开逾期面板 |

删除永远有确认：任务行内删除、勾选批量删除，或日历删除模式下按天圈选。

## 每日提醒

在设置中开启并选一个时间（默认 09:00）。每天过了该时刻，「今天到期 + 逾期」任务会被汇总提醒，每条任务每天最多一次。桌面版走系统通知；浏览器版为应用内弹窗加提示音，授权过系统通知且页面在后台时另有系统横幅。提醒需要应用处于运行状态。

## 你的数据

| 版本 | 存放位置 |
|---|---|
| 桌面版（macOS） | `~/.tuole/`——明文 JSON（`tasks.json`、`settings.json`、`backups/`）；拷贝该文件夹即可迁移设备 |
| 网页版 | 浏览器本地存储，跟随浏览器配置文件 |

数据不离开本机：没有账号、没有同步、没有遥测。

## 备份与 Excel

- **自动备份**：可选开启，间隔从 5 分钟到每天一次，滚动保留最近 10 份；没有任何任务时不产生备份
- **恢复**：从设置里的任意快照恢复，或从导出的 JSON 备份文件恢复；任何替换操作前自动保存恢复点
- **Excel**：导出 xlsx（任务与待办项两张表，任务表含标签列）；导入支持合并与整体替换两种模式

## 个性化

浅色 / 深色 / 跟随系统主题；中文 / English 界面语言。

## 许可证

[MIT](LICENSE)

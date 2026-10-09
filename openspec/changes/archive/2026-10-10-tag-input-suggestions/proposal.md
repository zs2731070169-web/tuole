# 标签输入联想（输入即筛，回车带出）

## Why

用户要求（2026-10-09）：编辑抽屉的标签输入支持**联想**——输入时从已有标签里匹配候选，**回车直接带出**高亮项。解决两个痛点：同一标签重复手打、拼写不一致导致「复盘/复盤」式碎片化。

## What Changes

### 1. 联想词表与匹配（纯函数，`src/shared/tags.ts`）

- `collectTagVocabulary(tasks)`：全库任务 → 标签词表（去重、按首次出现顺序）。**无预置标签库**——候选只来自用户自己的存量标签。
- `matchTagSuggestions(vocabulary, draft, exclude)`：大小写不敏感**前缀匹配**（联想语义，非搜索）；`draft` 为空返回全部（聚焦即浏览）；`exclude`（当前任务已加标签，大小写不敏感）从候选中剔除；保序。单测锚定。

### 2. 编辑抽屉标签输入框（`TaskEditor.tsx`）

- 输入框下方浮出候选列表（容器内 `absolute` 浮层，不引入新弹层依赖；`role="listbox"`，选项 `tabIndex={-1}` 不进 Tab 序——键盘走方向键）。
- 键盘：`↑/↓` 循环移动高亮（起点 -1，↓ 进到第一项）；**Enter 优先带出高亮项**（`addTag` 精确整段提交），无高亮时走既有 `parseTags` 提交路径（分隔符一次多项的能力不变）；`Esc` 关闭列表（下次输入重开）；继续输入重置高亮。
- 指针：悬停同步高亮，点击带出；选项 `onMouseDown preventDefault` 防输入框失焦抖动；输入框失焦即收起。
- IME 守卫：Enter/方向键/Esc 在 `isComposing` 期间一律不动（候选窗也在用方向键，与既有 Enter 守卫同款）。
- 高亮项被键盘移出可视区时 `scrollIntoView({ block: "nearest" })`。
- 无匹配不显示列表（不打扰新建任意标签——联想是加速器不是闸门）。

### 3. i18n

- 新增 `editor.tagSuggestions`（列表 aria-label，zh「可选用标签」/ en "Suggested tags"）。界面无其他新文案。

## 不改动 / 红线

- 标签仍是纯展示性元数据：不进筛选/搜索/状态机/统计；**不引入「标签选择器」预置库**（候选全部来自存量数据）。
- 全缓冲编辑与「保存 = 唯一提交点」不变：带出只动本地 `tags` 缓冲数组。
- 提交后的去重仍走既有**精确匹配**路径（`parseTags`/`cur.includes`）——不做大小写归一合并，避免波及既有语义；排除候选按大小写不敏感即可防住近重复的联想噪音。
- Enter 无高亮时的手打提交、分隔符多项、空输入框 Backspace 删末尾，全部保持原行为。

## Impact

- `src/shared/tags.ts`（+2 纯函数）、`src/features/tasks/TaskEditor.tsx`（标签字段）、`src/lib/i18n.ts`（+1 键）、`tests/tags.test.ts`（+用例）。
- 无数据契约、存储、Excel、状态机改动。

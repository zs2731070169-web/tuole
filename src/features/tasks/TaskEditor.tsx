// 任务详情/编辑抽屉：标题、分组、标签、待办项、优先级、执行时间（起止日期）、备注。
// **全缓冲编辑（2026-10 用户决策）**：所有字段只在本地暂存，「保存」才一次性原子落库——
// 编辑过程中任务状态/所在栏零变化（status chip 也因此恒定）；关闭入口**只有右上角 ×**（2026-10-09
// 用户决策：点遮罩/其他区域不收回，防误触丢缓冲）；× 关闭 = 放弃全部未保存修改（含已有任务）。红线：无「修改状态」控件；顺延/结束/删除不入抽屉——结束走
// 任务行「完成」按钮或拖入已完成栏，删除走行内按钮/选中条，顺延走行内按钮。底部只有「保存并关闭」一个动作。
import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Priority, Todo, TaskView } from "../../shared/types";
import { PRIORITY_OPTIONS } from "../../shared/constants";
import { collectTagVocabulary, matchTagSuggestions, parseTags } from "../../shared/tags";
import { moveTodoItem } from "../../shared/todos";
import { collectGroupVocabulary, groupToneClass, matchGroupSuggestions } from "../../shared/groups";
import { useTaskStore } from "../../stores/useTaskStore";
import { useUiStore } from "../../stores/useUiStore";
import { t } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { DateRangeField } from "../../components/DateRangeField";
import { STATUS_META, statusToneClass } from "../../shared/statusMachine";
import { computeTaskElapsed, formatTaskElapsed } from "../../shared/taskElapsed";
import { dayKeysInRange } from "../../lib/date";
import { isContiguousDays } from "../../shared/taskDates";
import { workbenchDateLabel } from "../../lib/date";

// 缓冲区新待办项的临时 id（提交时随 todos 数组整段落库，id 只需本地唯一）
function generateDraftTodoId(): string {
  return `todo-draft-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

// 待办项拖拽的插入位 = 首个「中点在指针之下」的行序号；全在之上 = 追加到末尾（DOM 序即列表序）。
// 与工作台栏内排序（makeListReorderHandlers 的 insertIndexAt）同口径：首行上方/尾行下方/
// 行间隙皆可放——只认 [data-todo-row]，新增输入行与提示段落不参与计算
function todoInsertIndexAt(container: HTMLElement, clientY: number): number {
  const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-todo-row]"));
  for (let i = 0; i < rows.length; i++) {
    const rect = rows[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return rows.length;
}

// 新建草稿不预填执行时间（2026-10-10 用户决策）；执行时间字段对草稿照常可挑——
// 「新建一律落未安排」由工作台分桶保证：未开始（执行首日 > 今天）的任务一律进「未安排」
// 栏（见 shared/workbench.ts），编辑器无需特殊分支
export function TaskEditor({ task }: { task: TaskView }) {
  const lang = useSettingsStore((s) => s.settings.language);
  const updateTask = useTaskStore((s) => s.updateTask);
  const closeEditor = useUiStore((s) => s.closeEditor);
  // 执行时间日历的无日期锚点：未安排任务锚其停靠日（工作台/日历新建草稿停靠在所属日），
  // 其余锚工作台当前选中日——看别的月份建任务时日历直接定位到目标月（2026-10-09 用户决策）
  const workbenchDay = useUiStore((s) => s.workbenchDay);
  // —— 缓冲区：打开（或切换编辑对象）时从任务快照初始化，交互期间不回读 store ——
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note);
  const [group, setGroup] = useState<string | null>(task.group);
  const [groupDraft, setGroupDraft] = useState("");
  const [tags, setTags] = useState<string[]>(task.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [scheduledDates, setScheduledDates] = useState<string[]>(task.scheduledDates);
  const [todos, setTodos] = useState<Todo[]>(task.todos);
  // 已完成任务的待办项展示一律视为已完成（2026-10-17 用户决策，与任务行 TodoPanel/计数
  // 同口径）：buffer 仍存真实 done——编辑器不提供勾选、保存不回写，仅行首圆点与徽标派生展示
  const taskCompleted = task.status === "done";
  const [todoDraft, setTodoDraft] = useState("");
  // 待办项拖拽排序（2026-10-10 用户需求）：拖拽源 id 与插入指示位，只在本地缓冲数组上重排，
  // 随「保存」整段落库（Task.todos 数组序即展示序，落库链路零改动）。dragover 阶段读不到
  // dataTransfer，同列表判定走这两个本地态（与工作台栏内排序判同栏的 draggingTaskId 同思路，
  // 但本拖拽永不离开编辑抽屉，不进 ui store）
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const [todoReorderAt, setTodoReorderAt] = useState<number | null>(null);
  // 标题必填校验（2026-10 用户决策）：为空点保存 → 不落库不关抽屉，行内红字提示 + 聚焦输入框
  const [titleError, setTitleError] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  // 标签联想（2026-10-09 用户要求：输入即筛、回车带出）：候选只来自全库存量标签（无预置库），
  // 排除当前已加；↑↓ 循环高亮、Enter 带出高亮项（无高亮走 parseTags 手打路径）、Esc/失焦收起
  const [tagSuggestIndex, setTagSuggestIndex] = useState(-1);
  const [tagSuggestDismissed, setTagSuggestDismissed] = useState(false);
  const tagSuggestListRef = useRef<HTMLDivElement | null>(null);

  // 联想词表 = 全库任务的 distinct 标签。唯一允许回读 store 的通道（只读、不进缓冲语义）：
  // 候选要随存量标签增长而更新，词表必须来自实时 tasks
  const allTasks = useTaskStore((s) => s.tasks);
  const tagVocabulary = useMemo(() => collectTagVocabulary(allTasks), [allTasks]);
  // 执行花费时间（纯派生只读，不进缓冲区——关闭抽屉即弃、保存也不落库）：头部 status chip 旁展示，
  // 与任务卡元信息行同口径（done → 耗时；today/overdue → 已进行；其余无值不渲染）
  const elapsed = computeTaskElapsed(task, new Date().toISOString());
  const elapsedText = elapsed ? formatTaskElapsed(elapsed, lang) : null;
  const tagSuggestions = useMemo(
    () => matchTagSuggestions(tagVocabulary, tagDraft, tags),
    [tagVocabulary, tagDraft, tags],
  );
  const tagSuggestOpen = !tagSuggestDismissed && tagSuggestions.length > 0;
  // 执行期是否分散（非连续）：决定编辑形态走「日期 chips + 区间重设」还是纯区间
  const scattered = !isContiguousDays({ scheduledDates });
  // 分组建议（单值字段）：词表同样来自全库存量分组，建议 chips 常驻输入框下方（点选即换组）
  const groupVocabulary = useMemo(() => collectGroupVocabulary(allTasks), [allTasks]);
  const groupSuggestions = useMemo(
    () => matchGroupSuggestions(groupVocabulary, groupDraft, group),
    [groupVocabulary, groupDraft, group],
  );

  // 键盘移动高亮时保持可见：列表内部滚动时把 active 项滚进视野（nearest 不惊动抽屉外层滚动）
  useEffect(() => {
    if (!tagSuggestOpen) return;
    tagSuggestListRef.current
      ?.querySelector('[data-tag-suggest-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [tagSuggestIndex, tagSuggestOpen]);

  // 备注框随内容自动长高（2026-10-09 用户反馈固定 3 行太小）：先 auto 归零再量 scrollHeight，
  // 删行时才会回缩。**不封顶**：长高无上限，超出部分由抽屉本体滚动承接。
  // 高度 = scrollHeight **加回上下边框厚度**——Tailwind 全局 border-box 下 scrollHeight
  // 不含边框，少算 2px 会让内容永久溢出 2px、textarea 内常驻一根细滑条（2026-10-09
  // 用户实测「滑条没删干净」的根因）；textarea 再叠 overflow-hidden 双保险。
  // 挂载即执行，打开长备注任务直接按内容撑开，切换编辑对象随 note 重置联动
  useEffect(() => {
    const el = noteInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const computedStyle = getComputedStyle(el);
    const borderThickness =
      parseFloat(computedStyle.borderTopWidth) + parseFloat(computedStyle.borderBottomWidth);
    el.style.height = `${el.scrollHeight + (Number.isNaN(borderThickness) ? 0 : borderThickness)}px`;
  }, [note]);

  useEffect(() => {
    setTitle(task.title);
    setNote(task.note);
    setGroup(task.group);
    setGroupDraft("");
    setTags(task.tags);
    setTagDraft("");
    // 联想态随缓冲区一并复位：残留高亮会让切换后首个 Enter 误带出上一个任务的候选
    setTagSuggestIndex(-1);
    setTagSuggestDismissed(false);
    setPriority(task.priority);
    setScheduledDates(task.scheduledDates);
    setTodos(task.todos);
    // 拖拽态随缓冲区一并复位（正常路径拖不进切换，防御残留）
    setDraggingTodoId(null);
    setTodoReorderAt(null);
    setTitleError(false);
    // workbenchDay 不入依赖：抽屉开着时选日控件被遮罩挡住不可达，锚点只在挂载/切换对象时取值
  }, [task.id]);

  // 保存 = 唯一提交点：全部字段连同执行期一次 updateTask 原子落库。
  // 标题必填：为空时阻断保存并给出行内提示（标题是任务的最小身份）
  const commitAndClose = () => {
    if (title.trim() === "") {
      setTitleError(true);
      titleInputRef.current?.focus();
      return;
    }
    updateTask(task.id, {
      title,
      note,
      group,
      tags,
      priority,
      scheduledDates,
      parkedDate: null,
      todos,
      ...(task.draft === true ? { draft: false } : {}),
    });
    // 「保存后跳转横幅」（CreationJumpBanner）已随「新建必落未安排」口径整体删除
    // （未开始的任务就停在当前视图的未安排栏，不存在「保存后从眼前消失」），勿凭记忆复活
    closeEditor();
  };

  // 标签提交：输入内容走 parseTags（逗号/顿号等分隔符一次得多项），与已有标签按序去重合并
  const commitTagDraft = () => {
    if (!tagDraft.trim()) return;
    const incoming = parseTags(tagDraft);
    setTags((cur) => [...cur, ...incoming.filter((x) => !cur.includes(x))]);
    setTagDraft("");
    setTagSuggestIndex(-1);
    setTagSuggestDismissed(false);
  };

  // 联想带出：候选标签整段精确提交（候选不含分隔符，不走 parseTags），并复位联想态
  const pickTagSuggestion = (candidateTag: string) => {
    setTags((cur) => (cur.includes(candidateTag) ? cur : [...cur, candidateTag]));
    setTagDraft("");
    setTagSuggestIndex(-1);
    setTagSuggestDismissed(false);
  };

  return (
    // role="dialog" 让编辑抽屉进入各处「操作浮层」豁免清单（[role='dialog'] closest 判定）：
    // 逾期面板的「点外部/Escape 收起」不把抽屉遮罩当外部、工作台点空白清高亮不吞抽屉内点击
    //（2026-10 用户决策：对逾期任务的操作退出后，逾期面板不得被顺带自动关闭）。
    // **不覆盖顶栏**（2026-10-09 用户反馈：全屏遮罩盖住 .desktop-titlebar 后应用窗口无法拖动）：
    // 遮罩与抽屉从顶栏下缘（69px = 顶栏实测高度，与概览 sticky 同口径）开始铺，桌面端顶栏
    // 拖拽带保持可用；浏览器端顶栏同样保持可见/可点
    <div role="dialog" className="fixed bottom-0 left-0 right-0 top-[69px] z-50 flex justify-end">
      {/* 纯视觉遮层：不响应点击（2026-10-09 用户决策——编辑抽屉只由右上角 × 收回，点遮罩/
          其他区域误触不丢缓冲区；closeEditor 仍负责草稿回收，只是唯一入口变成 × 按钮） */}
      <div className="absolute inset-0 bg-black/30" />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        {/* 头部 */}
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              statusToneClass(task.status),
            )}
          >
            {lang === "zh-CN" ? STATUS_META[task.status].label : task.status}
          </span>
          {/* 执行花费时间：只读派生展示（勿做成可编辑字段——耗时随状态机自动演进，无手工口径） */}
          {elapsedText && <span className="text-[12px] tabular-nums text-muted-foreground">{elapsedText}</span>}
          <button onClick={closeEditor} className="ml-auto grid size-8 place-items-center rounded-lg hover:bg-muted">
            <X className="size-4" />
          </button>
        </header>

        {/* 抽屉滚动区挂 scrollbar-none（2026-10-09 用户要求完全无滑条）：滚轮/触控板照常滚，
            只是不绘制滚动条；备注无上限长高后超出的部分就由这里承接 */}
        <div className="scrollbar-none flex-1 space-y-4 overflow-y-auto p-4">
          <Field label={lang === "zh-CN" ? "标题" : "Title"} required>
            <input
              ref={titleInputRef}
              value={title}
              aria-invalid={titleError}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false); // 一旦重新输入即撤下错误提示
              }}
              className={cn(
                "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[14px] font-medium outline-none focus:border-ring",
                titleError && "border-destructive focus:border-destructive",
              )}
            />
            {/* 必填行内提示（组件化，非弹窗）：为空点保存时出现，重新输入即消失 */}
            {titleError && (
              <p role="alert" className="mt-1 text-[11px] font-medium text-destructive">
                {t("editor.titleRequired", lang)}
              </p>
            )}
          </Field>

          {/* 分组（2026-10-09 用户决策：独立单值归类维度，与标签解耦）：日历同组同色
              成块识别；chip 即分组色。全缓冲——回车提交/点建议 chip 只改本地值，
              随「保存」原子落库；× 清除回无分组（日历不着色）。
              chip 内嵌输入框容器（2026-10-09 用户要求：回车后生成在框里，不是浮在框上方） */}
          <Field label={t("field.group", lang)}>
            <div className="space-y-1.5">
              <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 focus-within:border-ring">
                {group && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] leading-none",
                      groupToneClass(group),
                    )}
                  >
                    <span className="max-w-40 truncate">{group}</span>
                    <button
                      onClick={() => setGroup(null)}
                      aria-label={t("editor.removeGroup", lang)}
                      className="grid size-4 shrink-0 place-items-center rounded-full hover:bg-foreground/15"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}
                <input
                  value={groupDraft}
                  onChange={(e) => setGroupDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      // 输入法候选确认不提交（与标签/待办项输入同款守卫）
                      if (e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      const next = groupDraft.trim();
                      if (next) setGroup(next);
                      setGroupDraft("");
                    } else if (e.key === "Backspace" && groupDraft === "" && group) {
                      // 空输入框 Backspace 清除已选分组（与标签删除同款手感）
                      setGroup(null);
                    }
                  }}
                  // 已有分组时不再显示占位文案（chip 本身就是当前值的展示）
                  placeholder={group ? "" : t("editor.groupPlaceholder", lang)}
                  aria-label={t("field.group", lang)}
                  className="h-6 min-w-24 flex-1 border-0 bg-transparent p-0 text-[13px] outline-none placeholder:text-muted-foreground"
                />
              </div>
              {groupSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {groupSuggestions.map((candidateGroup) => (
                    <button
                      key={candidateGroup}
                      type="button"
                      onClick={() => {
                        setGroup(candidateGroup);
                        setGroupDraft("");
                      }}
                      className={cn(
                        "rounded-full px-2 py-1 text-[12px] leading-none transition-opacity hover:opacity-75",
                        groupToneClass(candidateGroup),
                      )}
                    >
                      {candidateGroup}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* 标签：自由输入的纯展示性元数据（2026-10 新增，不参与状态机/筛选/搜索）。
              全缓冲——只动本地数组，随「保存」原子落库。已加标签以 chip 内嵌输入框容器、
              输入框尾随其后（2026-10-09 用户要求：回车后生成在框里，不是浮在框上方）。
              输入时下方浮出存量标签联想：前缀匹配、↑↓ 高亮、Enter 带出（2026-10-09），候选无预置库 */}
          <Field label={t("field.tags", lang)}>
            <div className="relative">
              <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 focus-within:border-ring">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[12px] leading-none text-muted-foreground"
                  >
                    <span className="max-w-40 truncate">{tag}</span>
                    <button
                      onClick={() => setTags((cur) => cur.filter((x) => x !== tag))}
                      aria-label={t("editor.removeTag", lang).replace("{tag}", tag)}
                      className="grid size-4 shrink-0 place-items-center rounded-full hover:bg-muted-foreground/15 hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => {
                    setTagDraft(e.target.value);
                    // 新输入重开联想并复位高亮（Esc/失焦的收起只在下次输入前生效）
                    setTagSuggestDismissed(false);
                    setTagSuggestIndex(-1);
                  }}
                  onKeyDown={(e) => {
                    // 输入法组合期间方向键/回车/Esc 都归候选窗管辖，不做联想交互（与 Enter 提交同款守卫）
                    const composing = e.nativeEvent.isComposing;
                    if (e.key === "Enter") {
                      if (composing) return;
                      e.preventDefault();
                      // 有高亮候选：整段带出；无高亮：走 parseTags 手打路径（分隔符一次多项能力不变）
                      if (tagSuggestOpen && tagSuggestIndex >= 0 && tagSuggestions[tagSuggestIndex]) {
                        pickTagSuggestion(tagSuggestions[tagSuggestIndex]);
                      } else {
                        commitTagDraft();
                      }
                    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      if (composing || !tagSuggestOpen) return;
                      e.preventDefault();
                      setTagSuggestIndex((cur) => {
                        const count = tagSuggestions.length;
                        return e.key === "ArrowDown" ? (cur + 1) % count : (cur - 1 + count) % count;
                      });
                    } else if (e.key === "Escape") {
                      if (!composing && tagSuggestOpen) {
                        setTagSuggestDismissed(true);
                        setTagSuggestIndex(-1);
                      }
                    } else if (e.key === "Backspace" && tagDraft === "") {
                      // 空输入框 Backspace 删除末尾标签（chip 输入的常规手感）
                      setTags((cur) => cur.slice(0, -1));
                    }
                  }}
                  onBlur={() => setTagSuggestDismissed(true)}
                  // 已有标签时不再显示占位文案（chip 即当前值，占位只引导空态）
                  placeholder={tags.length === 0 ? t("editor.tagsPlaceholder", lang) : ""}
                  aria-label={t("field.tags", lang)}
                  aria-haspopup="listbox"
                  aria-expanded={tagSuggestOpen}
                  className="h-6 min-w-24 flex-1 border-0 bg-transparent p-0 text-[13px] outline-none placeholder:text-muted-foreground"
                />
              </div>
              {tagSuggestOpen && (
                <div
                  ref={tagSuggestListRef}
                  role="listbox"
                  aria-label={t("editor.tagSuggestions", lang)}
                  className="absolute left-0 right-0 top-full z-20 max-h-44 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md"
                >
                  {tagSuggestions.map((candidateTag, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === tagSuggestIndex}
                      key={candidateTag}
                      data-tag-suggest-active={index === tagSuggestIndex}
                      tabIndex={-1}
                      // preventDefault 保住输入框焦点：点候选不触发 blur、联想不闪没
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickTagSuggestion(candidateTag)}
                      onMouseEnter={() => setTagSuggestIndex(index)}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px]",
                        index === tagSuggestIndex
                          ? "bg-status-today/15 text-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {/* 标签图标：中性（分组色属「分组」字段，标签不再承担颜色语义） */}
                      <Tag className="size-3.5 shrink-0 opacity-60" aria-hidden />
                      <span className="truncate">{candidateTag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* 待办项（一层嵌套，2026-10 由「子任务」更名）：这里新增/改名/删除/**拖拽排序**，
              勾选在任务行的待办项面板里完成。全缓冲——增改删与重排都只动本地数组，
              保存时随整段 todos 落库。放置判定挂在列表容器上、按行几何中点算插入位
              （与工作台栏内排序同构），插入边界画亮蓝指示线 */}
          <Field label={t("field.todos", lang)}>
            <div
              className="space-y-1.5"
              onDragOver={(e) => {
                // 只接管本列表发起的待办项拖拽（dragover 读不到 dataTransfer，走本地态判定）；
                // 外部任务卡拖拽被抽屉遮罩拦截，即便穿透到此处也不 preventDefault、不误当落点
                if (!draggingTodoId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const index = todoInsertIndexAt(e.currentTarget, e.clientY);
                setTodoReorderAt((cur) => (cur === index ? cur : index));
              }}
              onDragLeave={(e) => {
                // 行间移动时子元素的 dragleave 会冒泡到容器：目标仍在容器内则不收指示线（防行间闪烁）
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setTodoReorderAt(null);
              }}
              onDrop={(e) => {
                if (!draggingTodoId) return;
                e.preventDefault();
                const index = todoInsertIndexAt(e.currentTarget, e.clientY);
                // 重排只动缓冲数组；「保存」才整段落库（× 关闭 = 放弃重排）
                setTodos((cur) => moveTodoItem(cur, draggingTodoId, index));
                setTodoReorderAt(null);
                // drop 落定即清拖拽 id（源行随重排换位，dragend 不保准派发到原元素）
                setDraggingTodoId(null);
              }}
            >
              {todos.map((s, i) => (
                <div key={s.id} data-todo-row={s.id} className="relative">
                  {/* 指示线：插入位 i 画在第 i 行上方；末尾追加画在最后一行下方（与工作台同款） */}
                  {todoReorderAt !== null &&
                    (todoReorderAt === i || (todoReorderAt === i + 1 && i === todos.length - 1)) && (
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-status-today",
                          todoReorderAt === i ? "-top-0.5" : "-bottom-0.5",
                        )}
                      />
                    )}
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5",
                      draggingTodoId === s.id && "opacity-40",
                    )}
                  >
                    {/* 拖拽手柄：静息 draggable=false 按下武装（全库防光标闪烁纪律），载荷用
                        专用的 text/todo-row-id——与任务卡/日历 chip 的 text/task-id 契约隔离 */}
                    <span
                      draggable={false}
                      onPointerEnter={(e) => {
                        if (e.buttons === 0) e.currentTarget.draggable = false;
                      }}
                      onPointerDown={(e) => {
                        e.currentTarget.draggable = true;
                      }}
                      onPointerUp={(e) => {
                        e.currentTarget.draggable = false;
                      }}
                      onPointerCancel={(e) => {
                        e.currentTarget.draggable = false;
                      }}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/todo-row-id", s.id);
                        e.dataTransfer.effectAllowed = "move";
                        // 拖影 = 整行快照（默认只有手柄小图标，视觉断裂）；热点锚在手柄中心，跟手
                        const rowElement = e.currentTarget.closest<HTMLElement>("[data-todo-row]");
                        if (rowElement) {
                          const rowRect = rowElement.getBoundingClientRect();
                          const gripRect = e.currentTarget.getBoundingClientRect();
                          e.dataTransfer.setDragImage(
                            rowElement,
                            gripRect.left - rowRect.left + gripRect.width / 2,
                            gripRect.top - rowRect.top + gripRect.height / 2,
                          );
                        }
                        setDraggingTodoId(s.id);
                      }}
                      onDragEnd={(e) => {
                        // 兜底清理：drop 已清态的取消/落回路径走这里，字段复位一个不漏
                        e.currentTarget.draggable = false;
                        setDraggingTodoId(null);
                        setTodoReorderAt(null);
                      }}
                      aria-label={t("editor.todoDragHandle", lang)}
                      className="shrink-0 cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="size-3.5" />
                    </span>
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        s.done || taskCompleted ? "bg-status-done" : "bg-muted-foreground/40",
                      )}
                      aria-hidden
                    />
                    <input
                      value={s.title}
                      onChange={(e) =>
                        setTodos((cur) =>
                          cur.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)),
                        )
                      }
                      className="min-w-0 flex-1 truncate bg-transparent text-[13px] outline-none"
                      aria-label={t("editor.todoTitleAria", lang)}
                    />
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {s.done || taskCompleted ? (lang === "zh-CN" ? "已完成" : "Done") : ""}
                    </span>
                    <button
                      onClick={() => setTodos((cur) => cur.filter((x) => x.id !== s.id))}
                      aria-label={t("editor.removeTodo", lang)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex gap-1.5">
                <input
                  value={todoDraft}
                  onChange={(e) => setTodoDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // isComposing：中文输入法确认候选的 Enter 不是「添加待办项」
                    if (e.key === "Enter" && todoDraft.trim() && !e.nativeEvent.isComposing) {
                      setTodos((cur) => [
                        ...cur,
                        { id: generateDraftTodoId(), title: todoDraft.trim(), done: false },
                      ]);
                      setTodoDraft("");
                    }
                  }}
                  placeholder={t("editor.todoPlaceholder", lang)}
                  className="h-8 flex-1 rounded-lg border border-input bg-background px-2.5 text-[13px] outline-none focus:border-ring"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {/* 已完成任务的待办项勾选入口已锁定（展示一律已勾选，2026-10-17）：
                    原提示的「去任务行勾选」分句不可达，只保留拖拽排序分句 */}
                {t(taskCompleted ? "editor.todoDragHint" : "editor.todoTickHint", lang)}
              </p>
            </div>
          </Field>

          <Field label={lang === "zh-CN" ? "优先级" : "Priority"}>
            <div className="flex gap-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value as Priority)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors",
                    priority === p.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {lang === "zh-CN" ? p.labelZh : p.labelEn}
                </button>
              ))}
            </div>
          </Field>

          {/* 执行时间字段对新建草稿同样可用（2026-10-10 用户纠错：时间可以选——只是工作台
              分桶规则保证未开始的任务一律停在「未安排」栏，见 shared/workbench.ts） */}
          <Field label={t("field.taskPeriod", lang)}>
            {/* 执行期 = 日期集合（2026-10-09 模型改造，可分散）：连续时以「起止区间」呈现
                （选区间 = 整段替换，含清除回未安排）；分散时逐日 chips（× 移除单日），
                区间选择器仍可用于重设为连续区间 */}
            {scattered && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {scheduledDates.map((day) => (
                  <span
                    key={day}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[12px] leading-none text-muted-foreground tabular-nums"
                  >
                    <span>{workbenchDateLabel(day, lang)}</span>
                    <button
                      onClick={() => setScheduledDates((cur) => cur.filter((d) => d !== day))}
                      aria-label={t("editor.removeDay", lang).replace("{date}", workbenchDateLabel(day, lang))}
                      className="grid size-4 shrink-0 place-items-center rounded-full hover:bg-muted-foreground/15 hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <DateRangeField
              lang={lang}
              start={scattered ? null : (scheduledDates[0] ?? null)}
              end={scattered ? null : (scheduledDates[scheduledDates.length - 1] ?? null)}
              anchorDay={task.parkedDate ?? workbenchDay}
              allowClear={false}
              onChange={({ start, end }) => {
                // 日期与状态独立且始终存在；选区间只整段替换日期集合。
                if (start) setScheduledDates(dayKeysInRange(start, end ?? start));
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {scattered ? t("editor.taskPeriodScatteredHint", lang) : t("editor.taskPeriodHint", lang)}
            </p>
          </Field>

          {/* 「重复」字段已整体移除（2026-10 用户决策：周期任务引擎未实现，有控件无效果最误导；
              数据契约同步删除，历史数据由 loadTasks 剥离，勿加回） */}

          {/* 备注沉底（2026-10 用户决策：与待办项互换位置）——长文本放最后，
              标题/标签/待办项等轻量字段先呈现。高度随内容自动伸缩（见挂载处 effect） */}
          <Field label={t("field.note", lang)}>
            <textarea
              ref={noteInputRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full resize-none overflow-hidden rounded-lg border border-input bg-background px-2.5 py-2 text-[13px] leading-relaxed outline-none focus:border-ring"
            />
          </Field>
        </div>

        {/* 底部保存条：唯一显式动作 = 保存并关闭（缓冲区原子落库 + closeEditor）。
            勿在此恢复顺延/结束/删除——各自有既定入口（见文件头注释） */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={commitAndClose}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
          >
            {t("action.save", lang)}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {/* 必填标记：红色 *（与为空保存时的行内校验提示同 destructive 语义色） */}
        {required && (
          <span aria-hidden className="ml-0.5 font-semibold text-destructive">
            *
          </span>
        )}
      </p>
      {children}
    </div>
  );
}

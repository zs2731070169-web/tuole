// 工作台：未安排 / 进行中 / 已完成三栏主流程 + 按需打开的逾期欠账面板。
// 日期选择在视图顶部条，作为本视图的统一筛选条件
// （默认今天，可改看任意一天）：进行中 / 已完成 / 进度条 / 状态筛选栏计数都随之切换；
// 「逾期」不再占用主画布：顶部计数是固定入口，点击打开无蒙层右侧面板；
// 拖动合法任务时，计数入口临时扩展为「排到昨天」的放置目标。
// 一屏只回答四件事——还有什么没安排、选中这天要做什么、还欠着什么账、这天做完了什么。
// 红线不变：栏内没有任何「修改状态」控件；拖入进行中栏 = 排到选中日（scheduleTo），
//          拖入已完成栏 = 显式结束（complete），逾期任务绝不自动完成；
//          已完成栏受 canFinish 门禁——未安排/未来安排任务拖入无效；逾期计数入口可接收未安排/进行中任务（排到昨天成欠账）。
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Inbox, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskView } from "../../shared/types";
import { todayKey, fromDateKey, addDaysKey } from "../../lib/date";
import { TaskItem } from "../../components/TaskItem";
import { computeAutoStatus, canFinish } from "../../shared/statusMachine";
import { bucketWorkbenchColumns } from "../../shared/workbench";
import { SchedulePopover } from "../../components/SchedulePopover";
import { useTaskStore } from "../../stores/useTaskStore";
import { scheduleStartForEnd } from "../../shared/taskDates";
import { useUiStore } from "../../stores/useUiStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { t } from "../../lib/i18n";

type ColumnKey = "unscheduled" | "today" | "overdue" | "done";

// 逾期栏可接收的拖入来源：未安排 + 进行中（今天/未来）——排到昨天即成欠账；
// 已逾期（本就在栏内）与已结束任务不允许拖入（scheduleTo 会清完成时间，等于变相重开）
const OVERDUE_DROPPABLE_STATUSES: TaskView["status"][] = ["unscheduled", "today", "upcoming"];

// 工作台栏内列表固定高度：一次性展示 7 张任务卡，超出部分栏内滚动（2026-10 用户决策）。
// 推导：单卡 67.25px = 边框 2 + 上下内边距 24（py-3）+ 标题行 19.25（14px × leading-snug 1.375）
// + mt-1 4 + 元信息行 18（12px × 继承行高 1.5）；7 卡 + 6 个 space-y-1.5 间隙（6px）
// = 7 × 67.25 + 36 = 506.75px。卡片结构（内边距/字号/行高/间隙）变化时须同步重算。
const WORKBENCH_COLUMN_LIST_HEIGHT = 506.75;

// 工作台选日控件（渲染在 ViewToolbar 行首 leading 槽，与右侧操作组同一行上下对齐）：
// 切换查看日期——进行中 / 已完成 / 进度条 / 状态筛选栏计数都随之切换。
// 高度对齐 h-9 / 13px 文字，与工具行右侧的新建/搜索/筛选同一视觉量级
export function WorkbenchDayPicker() {
  const lang = useSettingsStore((s) => s.settings.language);
  const zh = lang === "zh-CN";
  const workbenchDay = useUiStore((s) => s.workbenchDay);
  const setWorkbenchDay = useUiStore((s) => s.setWorkbenchDay);
  const isRealToday = workbenchDay === todayKey();
  const dayLabel = isRealToday ? t("board.today", lang) : formatDayLabel(workbenchDay, zh);

  return (
    <SchedulePopover
      lang={lang}
      onPick={setWorkbenchDay}
      selectedKey={workbenchDay}
      hint={zh ? "选择要在工作台查看的日期，默认今天" : "Pick a day to focus the workbench on; defaults to today"}
    >
      <button className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted active:scale-95">
        <CalendarDays className="size-4 text-muted-foreground" />
        {dayLabel}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
    </SchedulePopover>
  );
}

export function WorkbenchView({ views, overdueTasks }: { views: TaskView[]; overdueTasks: TaskView[] }) {
  const lang = useSettingsStore((s) => s.settings.language);
  const zh = lang === "zh-CN";
  const scheduleTo = useTaskStore((s) => s.scheduleTo);
  const startTask = useTaskStore((s) => s.startTask);
  const markUnscheduled = useTaskStore((s) => s.markUnscheduled);
  const complete = useTaskStore((s) => s.complete);
  const openEditor = useUiStore((s) => s.openEditor);
  const select = useUiStore((s) => s.select);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const [overCol, setOverCol] = useState<ColumnKey | null>(null);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const overdueTriggerRef = useRef<HTMLButtonElement | null>(null);
  const overduePanelRef = useRef<HTMLElement | null>(null);
  // 拖拽中的任务状态：拖起的瞬间给各栏预亮「能不能放」——合法栏虚线提示、非法栏降透明，
  // 把「试错才发现无效」变成「一眼看到能放哪」（悬停高亮 over 仍优先于预亮）
  const draggingStatus = useUiStore((s) => s.draggingStatus);

  // 拖起预亮判定（与 dropHandlers 的门禁同口径）：未安排/进行中栏无门禁恒可放；已完成栏仅「今天」。
  // （顶部「拖入逾期」目标不再走预亮——改为选中即常驻，见 overdueEntryVisible）
  const dropTargetHint = (col: ColumnKey): "valid" | "invalid" | undefined => {
    if (!draggingStatus) return undefined;
    if (col === "done") return draggingStatus === "today" ? "valid" : "invalid";
    return "valid";
  };
  // 日期锚点：进行中栏 / 已完成栏 / 进度条都围绕选中日展开，默认今天。
  // 放在 ui store（不持久化）：状态筛选栏的计数也按选中日统计，需要与这里共享同一锚点；
  // 选日入口在 WorkbenchDayPicker（ViewToolbar 行首插槽）
  const workbenchDay = useUiStore((s) => s.workbenchDay);
  const isRealToday = workbenchDay === todayKey();
  const dayLabel = isRealToday ? t("board.today", lang) : formatDayLabel(workbenchDay, zh);

  // 欠账清零**不再自动收起面板**（2026-10 用户决策：对逾期任务的任何操作（改期/取消安排/删除等）
  // 退出后面板保持原样，清零时空列表给「已清零」提示，由用户自己关）。
  // 面板入口 = 顶部计数按钮，工作台无状态筛选栏，勿加回筛选联动的自动开面板。

  // 点空白处撤下任务选中高亮（2026-10 用户决策：不要求再点一次卡片取消）。
  // 监听挂 document：三栏以下的页面留白（main 底衬区）等工作台根容器之外的区域也要命中；
  // 本组件随视图切换卸载，监听自动回收。豁免：任务卡（data-task-card）、「拖入逾期」入口、
  // 各类弹层（编辑抽屉/确认框/逾期面板等 dialog 与 Radix 传送门弹层）。
  // 只撤高亮通道（selectedIds）——批量勾选集合（checkedIds）是独立通道，不受影响；
  // 行内动作按钮本就 stopPropagation，事件不会冒泡到 document。
  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (
        target.closest(
          "[data-task-card], [data-column='overdue'], [role='dialog'], [role='alertdialog'], [data-radix-popper-content-wrapper]",
        )
      )
        return;
      if (useUiStore.getState().selectedIds.length) useUiStore.getState().clearHighlight();
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  // 非模态面板：点外部或按 Escape 收起；不加遮罩，工作台仍保持可见，也可把欠账拖回三栏。
  // 豁免各类传送门弹层（2026-10 用户决策）：删除确认框（AlertDialog）里的「删除/取消」、
  // 行内改期等 Popover 里的日期点击都发生在面板 DOM 之外（传送门挂 body），不豁免会被
  // 误判为「点外部」而顺带关掉面板——确认/取消后面板保持原样继续操作。
  useEffect(() => {
    if (!overdueOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        !target ||
        overduePanelRef.current?.contains(target) ||
        overdueTriggerRef.current?.contains(target) ||
        target.closest("[role='alertdialog'], [role='dialog'], [data-radix-popper-content-wrapper]")
      )
        return;
      setOverdueOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 有更上层的操作浮层（编辑抽屉/确认框/改期 Popover）开着时，这记 Escape 属于那一层——
      // 面板不抢着关（自身 role="dialog" 除外）；无浮层时才轮到面板收起
      const layers = document.querySelectorAll(
        "[role='dialog'], [role='alertdialog'], [data-radix-popper-content-wrapper']",
      );
      for (const layer of layers) {
        if (layer !== overduePanelRef.current && !overduePanelRef.current?.contains(layer)) return;
      }
      setOverdueOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [overdueOpen]);

  // 分桶基于派生 status + 选中日（纯函数在 shared/workbench.ts，口径有单测锚点）；
  // 上游 applyFilters 已在工作台强制忽略状态与时间范围，实际生效 = 搜索 + 优先级
  //（状态维度由三栏+逾期面板承载，工作台无状态筛选栏——2026-10 用户决策，勿加回）。
  const cols = useMemo(() => bucketWorkbenchColumns(views, workbenchDay), [views, workbenchDay]);

  // 当日完成进度：口径与屏幕逐项对账（默认今天，选其他天时统计该天）——
  // done  = 已完成栏「当日」桶（选中日完成的任务，不论当初安排在哪天）；
  // total = done + 进行中栏剩余（dayList）；逾期已独立成栏、不计入当天进度，
  // 因此「剩余 {n}」恒等于进行中栏可见卡片数，完成进行中栏里任何一张卡进度同步 +1。
  const dayDone = cols.doneOnDay.length;
  const dayTotal = dayDone + cols.dayList.length;
  const dayProgress = {
    done: dayDone,
    total: dayTotal,
    rate: dayTotal === 0 ? null : Math.round((dayDone / dayTotal) * 100),
  };

  // 放置容器：onDragOver 必须 preventDefault，否则 onDrop 永不触发
  const dropHandlers = (col: ColumnKey) => ({
    onDragOver: (e: React.DragEvent) => {
      // 栏内排序手势（拖起的任务就在本栏）：整栏放置语义不参与——不 preventDefault、
      // 不整栏高亮，列表容器的排序放置已接管落点；列表外区域（栏头/边距）自然不可放
      const draggingTaskId = useUiStore.getState().draggingTaskId;
      if (draggingTaskId && columnTaskIds(col)?.has(draggingTaskId)) {
        if (overCol === col) setOverCol(null);
        return;
      }
      // 已完成栏拒绝两类拖入：不可结束的（未安排/未来安排）与**逾期**——
      // 产品约定：欠账只能拖入未安排/进行中改期跟进，不可直接拖入已完成；
      // 逾期栏只接收未安排/进行中（今天/未来）任务，已逾期/已结束拖入无效。
      // 不 preventDefault 即不允许放置，光标呈禁用态且栏不高亮。
      // dragover 阶段读不到 dataTransfer，改读 ui store 里记录的拖拽状态。
      const draggingStatus = useUiStore.getState().draggingStatus;
      if (col === "done" && draggingStatus && (!canFinish(draggingStatus) || draggingStatus === "overdue")) {
        if (overCol === col) setOverCol(null);
        return;
      }
      if (col === "overdue" && draggingStatus && !OVERDUE_DROPPABLE_STATUSES.includes(draggingStatus)) {
        if (overCol === col) setOverCol(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overCol !== col) setOverCol(col);
    },
    onDragLeave: () => setOverCol((c) => (c === col ? null : c)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOverCol(null);
      // drop 落定即清拖拽态：任务换栏后源卡片随即卸载，dragend 不再派发到已卸载元素
      //（遗留非空的 draggingStatus 会让「拖入逾期」入口卡死不消失——2026-10 实测 bug，
      // 清空动作放在不卸载的放置目标侧才必然执行；TaskItem 的 onDragEnd 仍兜底未换栏的场景）
      const draggingTaskId = useUiStore.getState().draggingTaskId;
      useUiStore.getState().setDraggingStatus(null);
      useUiStore.getState().setDraggingTaskId(null);
      // 栏内排序手势落到列表外区域（栏头/边距）：不算排期/完成，排序落点只在列表容器内
      if (draggingTaskId && columnTaskIds(col)?.has(draggingTaskId)) return;
      const id = e.dataTransfer.getData("text/task-id");
      if (!id) return;
      if (col === "today") startTask(id); // 拖入进行中只改生命周期，任务日期保持不变
      else if (col === "overdue") {
        // 门禁（防御性双保险，与 dragover 同口径）：仅未安排/今天/未来可拖入——排到昨天即成欠账
        const draggedTask = useTaskStore.getState().tasks.find((t) => t.id === id);
        const status = draggedTask ? computeAutoStatus(draggedTask, { now: new Date() }) : null;
        if (status && OVERDUE_DROPPABLE_STATUSES.includes(status)) {
          // 跨天任务保持原跨度，同时让终点落在昨天，才能确实成为逾期。
          scheduleTo(id, scheduleStartForEnd(draggedTask!, addDaysKey(todayKey(), -1)));
        }
      } else if (col === "done") {
        // 门禁（防御性双保险，与 dragover 同口径）：未安排/未来安排不可拖入已完成——先排期、日期到了再结束；
        // 逾期同样拒绝——欠账要走「拖入未安排/进行中」改期，显式结束请用行内「完成」按钮或编辑抽屉
        const draggedTask = useTaskStore.getState().tasks.find((t) => t.id === id);
        const status = draggedTask ? computeAutoStatus(draggedTask, { now: new Date() }) : null;
        if (status && status !== "overdue" && canFinish(status)) complete([id], "dragged");
      } else markUnscheduled(id); // 拖回未安排只改生命周期，日期保持不变
    },
  });

  // —— 栏内拖拽排序（2026-10 新增；放置判定挂在**列表容器**上、按卡片几何中点算插入位——
  // 首卡上方 / 尾卡下方 / 卡片间隙都可放，修复「拖不到第一张前面」（旧版只在卡上半区可放的遗留缺陷）。
  // 同栏拖拽才接管；跨栏/未知来源不 preventDefault，事件冒泡到 <section> 走整栏放置语义 ——
  const [reorderAt, setReorderAt] = useState<{ col: ColumnKey; index: number } | null>(null);
  const reorder = useTaskStore((s) => s.reorder);

  // 拖起的任务就在本栏（三主栏）→ 整栏放置语义让位：栏内排序接管落点，
  // 栏头/边距等列表外区域成为不可放（防同栏拖拽误触排期）；顶部「拖入逾期」目标不受影响
  const columnTaskIds = (col: ColumnKey): Set<string> | null => {
    if (col === "unscheduled") return new Set(cols.unscheduled.map((t) => t.id));
    if (col === "today") return new Set(cols.dayList.map((t) => t.id));
    if (col === "done") return new Set(cols.doneOnDay.map((t) => t.id));
    return null;
  };

  const makeListReorderHandlers = (col: ColumnKey, list: TaskView[]) => {
    // dragover 阶段读不到 dataTransfer：同栏判定走 ui store 的 draggingTaskId
    const sameColumnDrag = () => {
      const draggedId = useUiStore.getState().draggingTaskId;
      return draggedId && list.some((t) => t.id === draggedId) ? draggedId : null;
    };
    // 插入位 = 首个「中点在指针之下」的卡片序号；全在之上 = 追加到末尾（DOM 序即列表序）
    const insertIndexAt = (container: HTMLElement, clientY: number) => {
      const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-reorder-card]"));
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return i;
      }
      return cards.length;
    };
    return {
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
        if (!sameColumnDrag()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const index = insertIndexAt(e.currentTarget, e.clientY);
        setReorderAt((cur) => (cur && cur.col === col && cur.index === index ? cur : { col, index }));
      },
      onDragLeave: () => setReorderAt((cur) => (cur?.col === col ? null : cur)),
      onDrop: (e: React.DragEvent<HTMLDivElement>) => {
        const draggedId = sameColumnDrag();
        if (!draggedId) return; // 跨栏：冒泡给整栏放置（排期/完成/取消安排）
        e.preventDefault();
        e.stopPropagation(); // 栏内重排已落定，不能再当一次「拖入本栏」
        const index = insertIndexAt(e.currentTarget, e.clientY);
        const orderedIds = list.map((t) => t.id).filter((id) => id !== draggedId);
        orderedIds.splice(Math.min(index, orderedIds.length), 0, draggedId);
        reorder(orderedIds); // store 重写该栏 sortOrder 并持久化
        setReorderAt(null);
        // drop 落定即清拖拽 id（与 draggingStatus 同款防御：源卡可能随重排卸载，dragend 不保准）
        useUiStore.getState().setDraggingTaskId(null);
      },
    };
  };

  // 指示线：插入位 i 画在第 i 张卡上方；末尾追加（index = n）画在最后一张卡下方
  const renderRows = (col: ColumnKey, list: TaskView[]) =>
    list.map((tk, i) => (
      <div key={tk.id} data-reorder-card={tk.id} className="relative">
        {reorderAt?.col === col &&
          (reorderAt.index === i || (reorderAt.index === i + 1 && i === list.length - 1)) && (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-status-today",
                reorderAt.index === i ? "-top-0.5" : "-bottom-0.5",
              )}
            />
          )}
        <TaskItem task={tk} selected={selectedIds.includes(tk.id)} onOpen={openEditor} onToggleSelect={select} />
      </div>
    ));

  // 「拖入逾期」大放置目标出现条件（2026-10 用户决策更新：**无需先点选，按住直接拖拽即可**）：
  // ① 正在拖拽可拖入任务（draggingStatus ∈ 未安排/今天/未来）——按下即拖的单手势路径，
  //    拖起瞬间入口出现、松手/取消拖拽即消失（「放开就取消选中」，不留常驻态）；
  // ② 或已点选了可拖入任务——原「先点选再拖」的两步路径仍然可用，选中期间入口常驻。
  // 拖拽/选中逾期或已完成任务均不满足条件，入口不出现；条件经 draggingStatus 与 some() 实时重估
  const overdueEntryVisible = useMemo(
    () =>
      (draggingStatus !== null && OVERDUE_DROPPABLE_STATUSES.includes(draggingStatus)) ||
      views.some((v) => selectedIds.includes(v.id) && OVERDUE_DROPPABLE_STATUSES.includes(v.status)),
    [views, selectedIds, draggingStatus],
  );

  return (
    <div className="space-y-3">
      {/* 顶部条：当日完成进度 + 各栏计数概览。日期筛选控件（WorkbenchDayPicker）与「返回日历」
          一起在 ViewToolbar 行首插槽（与右侧操作组同一行上下对齐），由 routes/index 传入。
          不加 px 缩进：左缘须与 ViewToolbar 的行首插槽、下方三栏栅格冲齐 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-60 max-w-md flex-1 items-center gap-3">
          <span className="shrink-0 text-[12px] font-medium text-foreground">
            {isRealToday ? t("stats.todayProgress", lang) : t("stats.dayProgress", lang).replace("{date}", dayLabel)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {dayProgress.done} / {dayProgress.total}
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-status-today">
                {dayProgress.rate === null ? "—" : `${dayProgress.rate}%`}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-status-today transition-[width] duration-500 ease-out"
                style={{ width: `${dayProgress.rate ?? 0}%` }}
              />
            </div>
            {/* 进度条下方的提示行（还剩 N 项/全部完成/无任务）已按需求移除——
                进度数字 done/total 与百分比已表达剩余量，勿加回 */}
          </div>
        </div>
        <div className="relative ml-auto flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground/80">
          <span>{t("board.unscheduled", lang)} {cols.unscheduled.length}</span>
          <span aria-hidden>·</span>
          <span>{t("board.active", lang)} {cols.dayList.length}</span>
          <span aria-hidden>·</span>
          {overdueTasks.length > 0 ? (
            <button
              ref={overdueTriggerRef}
              type="button"
              aria-expanded={overdueOpen}
              aria-controls="workbench-overdue-panel"
              onClick={() => setOverdueOpen((open) => !open)}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border border-status-overdue/30 bg-status-overdue/[0.08] px-2 font-medium text-status-overdue transition-colors hover:bg-status-overdue/15",
                overdueOpen && "ring-2 ring-status-overdue/15",
              )}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-status-overdue" />
              {t("board.overdue", lang)} {overdueTasks.length}
            </button>
          ) : (
            <span>{t("board.overdue", lang)} 0</span>
          )}
          <span aria-hidden>·</span>
          <span>{t("board.done", lang)} {cols.doneOnDay.length}</span>

          {/* 「拖入逾期」入口：拖起可拖入任务的瞬间或选中可拖入任务时，于原计数位置覆盖出大热区
              （见 overdueEntryVisible 判定注释）；绝对定位不引发布局跳动，拖拽结束/取消选中即消失 */}
          {overdueEntryVisible && (
            <div
              data-column="overdue"
              {...dropHandlers("overdue")}
              className={cn(
                "absolute right-0 top-1/2 z-20 flex h-9 w-64 -translate-y-1/2 items-center justify-center gap-2 rounded-xl border border-dashed border-status-today/50 bg-card px-4 text-[12px] font-medium text-muted-foreground shadow-sm transition-colors",
                overCol === "overdue" && "border-status-today bg-status-today/[0.08] text-foreground ring-2 ring-status-today/35",
              )}
            >
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-status-overdue" />
              {t("board.dropToOverdue", lang)}
            </div>
          )}
        </div>
      </div>

      {/* 主工作流固定为横向三栏：未安排 → 进行中 → 已完成。 */}
      <div className="grid grid-cols-3 gap-3">
        {/* 未安排 */}
        <Column
          column="unscheduled"
          title={t("board.unscheduled", lang)}
          count={cols.unscheduled.length}
          accent="bg-muted-foreground/40"
          over={overCol === "unscheduled"}
          dropHint={dropTargetHint("unscheduled")}
          drop={dropHandlers("unscheduled")}
          listDrag={makeListReorderHandlers("unscheduled", cols.unscheduled)}
          hint={
            isRealToday
              ? zh
                ? "点任务右侧「安排」= 排到今天 · 拖回这里 = 取消排期"
                : "Click a task's Schedule button to schedule it today · drop here to unschedule"
              : zh
                ? "点任务右侧「安排」= 排到选中日 · 拖回这里 = 取消排期"
                : "Click a task's Schedule button to schedule it to the selected day · drop here to unschedule"
          }
        >
          {cols.unscheduled.length === 0 ? (
            <EmptyLine text={t("board.emptyUnscheduled", lang)} />
          ) : (
            renderRows("unscheduled", cols.unscheduled)
          )}
        </Column>

        {/* 进行中（内容锚定顶部条选中的日期；标题固定「进行中」，具体日期由顶部筛选控件展示） */}
        <Column
          column="today"
          title={t("board.active", lang)}
          count={cols.dayList.length}
          accent="bg-status-today"
          over={overCol === "today"}
          dropHint={dropTargetHint("today")}
          drop={dropHandlers("today")}
          listDrag={makeListReorderHandlers("today", cols.dayList)}
          tone="focus"
          hint={isRealToday ? t("board.dragToToday", lang) : t("board.dragToDay", lang)}
        >
          {cols.dayList.length === 0 ? (
            <EmptyLine text={isRealToday ? t("board.emptyToday", lang) : t("board.emptyDay", lang)} />
          ) : (
            renderRows("today", cols.dayList)
          )}
        </Column>

        {/* 已完成：只收「完成日 = 选中日」的任务，直接平铺（无折叠组件）；
            完成日早于选中日的不展示；过多时与其他栏一样定高内部滚动 */}
        <Column
          column="done"
          title={t("board.done", lang)}
          count={cols.doneOnDay.length}
          accent="bg-status-done"
          over={overCol === "done"}
          dropHint={dropTargetHint("done")}
          drop={dropHandlers("done")}
          listDrag={makeListReorderHandlers("done", cols.doneOnDay)}
          tone="quiet"
          hint={t("board.dropToFinish", lang)}
        >
          {cols.doneOnDay.length === 0 ? (
            <EmptyLine text={t("board.emptyDone", lang)} />
          ) : (
            renderRows("done", cols.doneOnDay)
          )}
        </Column>
      </div>

      {/* 逾期任务按需查看：fixed 非模态面板不参与主画布排版，也没有遮罩；
          卡片仍可拖到下方三栏，直接动作则覆盖最常见的改期与取消安排。 */}
      {/* 面板开着就渲染（清零不自动关，2026-10 用户决策——空列表显示「已清零」提示） */}
      {overdueOpen && (
        <aside
          ref={overduePanelRef}
          id="workbench-overdue-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="workbench-overdue-title"
          className="fixed bottom-4 right-4 top-21 z-40 flex w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-status-overdue/25 bg-background shadow-xl max-[640px]:left-2 max-[640px]:right-2 max-[640px]:top-18 max-[640px]:w-auto"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-status-overdue/15 bg-status-overdue/[0.035] px-4 py-3.5">
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-status-overdue" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 id="workbench-overdue-title" className="text-[14px] font-semibold text-foreground">
                  {t("board.overduePanel", lang)}
                </h2>
                <span className="rounded-full bg-status-overdue/12 px-1.5 text-[11px] tabular-nums text-status-overdue">
                  {overdueTasks.length}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {t("board.overdueHint", lang)}
              </p>
            </div>
            <button
              type="button"
              aria-label={t("board.closeOverduePanel", lang)}
              title={t("board.closeOverduePanel", lang)}
              onClick={() => setOverdueOpen(false)}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {/* 清零不自动关面板（2026-10 用户决策）：空列表给提示，由用户自己关闭 */}
            {overdueTasks.length === 0 && <EmptyLine text={t("board.overdueCleared", lang)} />}
            {overdueTasks.map((tk) => (
              <div key={tk.id} className="rounded-xl border border-border/60 bg-card p-1.5">
                {/* 改期动作（安排/提到今天/改期/顺延/取消安排）统一在 TaskItem 逾期卡的
                    下方常驻行渲染，本组件不再叠加额外按钮行（2026-10 用户决策，勿加回） */}
                <TaskItem
                  task={tk}
                  selected={selectedIds.includes(tk.id)}
                  onOpen={openEditor}
                  onToggleSelect={select}
                />
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

// 单栏：栏头（色点 + 标题 + 计数 + 可选动作右置）+ 列表区；传入 drop 时整栏即放置容器
function Column({
  column,
  title,
  count,
  accent,
  over,
  drop,
  dropHint,
  tone = "default",
  action,
  hint,
  listDrag,
  children,
}: {
  column: string;
  title: string;
  count: number;
  accent: string;
  over: boolean;
  drop?: { onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void };
  /** 栏内排序放置：列表容器的 dragover/dragleave/drop（WorkbenchView 按栏构造，见 makeListReorderHandlers） */
  listDrag?: { onDragOver: (e: React.DragEvent<HTMLDivElement>) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent<HTMLDivElement>) => void };
  /** 拖起预亮：valid = 虚线提示可放（语义色 status-today，勿用 primary），invalid = 整栏降透明 */
  dropHint?: "valid" | "invalid";
  /** 静息视觉层级：进行中是主工作区；已完成退到背景层。 */
  tone?: "default" | "focus" | "danger" | "quiet";
  action?: React.ReactNode;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-column={column}
      {...(drop ?? {})}
      className={cn(
        "flex flex-col rounded-2xl border p-2.5 transition-colors",
        tone === "default" && "border-border/60 bg-card/40",
        tone === "focus" && "border-status-today/25 bg-status-today/[0.035]",
        tone === "danger" && "border-status-overdue/30 bg-status-overdue/[0.025]",
        tone === "quiet" && "border-border/50 bg-muted/[0.14]",
        dropHint === "valid" && "border-dashed border-status-today/50",
        dropHint === "invalid" && "opacity-45",
        over && "border-status-today bg-status-today/[0.08] ring-2 ring-status-today/35",
      )}
    >
      {/* 栏头单行布局：动作右置，窄栏下不把「新建」按钮挤成竖排 */}
      <header className="mb-2 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", accent)} />
          <h2
            className={cn(
              "shrink-0 text-[13px] font-semibold tracking-wide",
              tone === "quiet" ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {title}
          </h2>
          <span
            className={cn(
              "rounded-full px-1.5 text-[11px] tabular-nums",
              tone === "focus"
                ? "bg-status-today/12 text-status-today"
                : tone === "danger"
                  ? "bg-status-overdue/12 text-status-overdue"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {count}
          </span>
          {action && <span className="ml-auto shrink-0">{action}</span>}
        </div>
      </header>
      {/* 列表区定高内部滚动：固定高度按「一次性展示 7 张任务卡」预留（WORKBENCH_COLUMN_LIST_HEIGHT，
          2026-10 用户决策），多余任务栏内滚动查看，三栏高度恒定不随任务数参差。
          勿加 overscroll-contain：会切断滚动链，栏内滚到边界后鼠标滚轮无法继续滚动整页 */}
      <div
        className="space-y-1.5 overflow-y-auto pr-0.5"
        style={{ height: WORKBENCH_COLUMN_LIST_HEIGHT }}
        {...(listDrag ?? {})}
      >
        {children}
      </div>
      {/* 拖放说明只在拖起任务后出现；用不换行空白占住单行高度，避免拖起瞬间栏高变化。 */}
      <p className="mt-2 min-h-4 px-0.5 text-[11px] leading-4 text-muted-foreground/70">
        {dropHint !== undefined ? hint : "\u00a0"}
      </p>
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 px-3 py-6 text-[12px] text-muted-foreground">
      <Inbox className="size-4 opacity-50" />
      {text}
    </div>
  );
}

// 选中日的栏头/进度标签：今天显示「今日」，其余显示「M月d日 · 周X」/「Oct 8 · Wed」
function formatDayLabel(dateKey: string, zh: boolean): string {
  const d = fromDateKey(dateKey);
  if (zh) {
    const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 · ${week}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
}

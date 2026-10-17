// 应用主界面：初始化 store + scheduler，组合顶部栏、概览（纯统计仪表盘）/工作台/日历/备忘视图、
// 任务编辑抽屉、设置面板。贯彻「写自动流转 / 读手动筛选」交互理念（筛选查看在日历与工作台）。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskStore } from "../stores/useTaskStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useFilterStore } from "../stores/useFilterStore";
import { useUiStore } from "../stores/useUiStore";
import { useCalendarStore } from "../stores/useCalendarStore";
import { useNoteStore } from "../stores/useNoteStore";
import { useMessageStore } from "../stores/useMessageStore";
import { applyFilters } from "../shared/filter";
import { computeOverviewStats } from "../shared/overviewStats";
import { toDateKey } from "../lib/date";
import { computeAutoStatus } from "../shared/statusMachine";
import { scheduledSpanOverlaps } from "../shared/taskDates";
import { startScheduler, stopScheduler } from "../services/scheduler";
import { startAutoBackup, stopAutoBackup } from "../services/backup";
import { TopBar } from "../components/TopBar";
import { ViewToolbar } from "../components/ViewToolbar";
import { StatusFilterBar } from "../components/StatusFilterBar";
import { StatsCard } from "../components/StatsCard";
import { InsightsPanel } from "../components/InsightsPanel";
import { WorkbenchView, WorkbenchDayPicker } from "../features/workbench/WorkbenchView";
import { CalendarView, CalendarLeadingBar, CalendarActionsMenu } from "../features/calendar/CalendarView";
import { NotesView, NotesDayPicker } from "../features/notes/NotesView";
import { NotesEditor } from "../features/notes/NotesEditor";
import { TaskEditor } from "../features/tasks/TaskEditor";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { SelectionBar } from "../components/SelectionBar";
import { ConfirmDialog } from "../components/ConfirmDialog";

export const Route = createFileRoute("/")({ component: App });

function App() {
  const initTasks = useTaskStore((s) => s.init);
  const initNotes = useNoteStore((s) => s.init);
  const initMessages = useMessageStore((s) => s.init);
  const initSettings = useSettingsStore((s) => s.init);
  const tasks = useTaskStore((s) => s.tasks);
  const settings = useSettingsStore((s) => s.settings);
  const filter = useFilterStore((s) => s.filter);
  const setStatus = useFilterStore((s) => s.setStatus);
  const view = useUiStore((s) => s.view);
  // 从日历点任务 chip 跳到工作台后的回退入口；任何手动切视图（TopBar）都会清空 returnView
  const returnView = useUiStore((s) => s.returnView);
  const goBackToReturnView = useUiStore((s) => s.goBackToReturnView);
  const editingId = useUiStore((s) => s.editingId);
  const noteEditor = useUiStore((s) => s.noteEditor);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const overviewHeaderRef = useRef<HTMLDivElement | null>(null);
  const [booted, setBooted] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [overviewHeaderHeight, setOverviewHeaderHeight] = useState(0);

  // 概览头部固定在视口，列表用等高占位从其下方开始；筛选/工具行换行时同步更新高度。
  useLayoutEffect(() => {
    if (view !== "all" || !booted || !overviewHeaderRef.current) return;
    const header = overviewHeaderRef.current;
    const measure = () => setOverviewHeaderHeight(header.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [view, booted]);

  // 启动：加载数据 -> 清理历史空壳 -> 启动状态结算调度器
  //（首启演示数据播种已按 2026-10 用户决策移除：发布版空库即空列表，勿加回）
  useEffect(() => {
    initSettings();
    initTasks();
    initNotes(); // 备忘池独立存储，与任务数据互不影响
    initMessages(); // 消息中心独立存储（每日摘要池）
    useTaskStore.getState().purgeEmptyDrafts();
    startScheduler(); // 内含当日摘要生成（幂等）：每天首次启动生成当日消息进消息中心
    startAutoBackup(); // 自动备份引擎：按设置的间隔对任务做应用内滚动快照
    setBooted(true);
    return () => {
      // Strict Mode / 页面卸载时完整回收定时器与可见性监听，避免重复执行恢复焦点后的任务扫描
      stopScheduler();
      stopAutoBackup();
    };
  }, [initSettings, initTasks, initNotes, initMessages]);

  // 摘要开关切换为开时立即生成当日摘要（幂等；承接「开启立即可验证」的既有决策）。
  // 挂载时也会随 reminderEnabled 初值触发一次，与 startScheduler 内的生成互为幂等重入
  const reminderEnabled = settings.reminderEnabled;
  useEffect(() => {
    if (reminderEnabled) useMessageStore.getState().ensureDailyDigest();
  }, [reminderEnabled]);

  // views 是派生计算，必须在 useMemo 中做，避免作为 zustand selector 返回新数组导致无限重渲染。
  // draft 草稿（未点「保存」的新建任务）在此排除——任何列表/日历格/统计/筛选计数都不渲染它，
  // 只有编辑抽屉经 editingTask 从原始 tasks 取它继续编辑
  const views = useMemo(
    () =>
      tasks
        .filter((t) => t.draft !== true)
        .map((t) => ({
          ...t,
          status: computeAutoStatus(t, { now: new Date() }),
        })),
    [tasks, refreshVersion],
  );

  // 各视图的筛选口径（产品决策）：工作台不渲染状态筛选栏——三栏（未安排/进行中/已完成）+
  // 逾期面板本身已是状态维度，再叠一层状态筛选属同构冗余（2026-10 用户决策，勿加回）；
  // 因此本视图强制忽略状态（其他视图遗留的「进行中」等无可见控件可解释/撤销，切回原视图筛选仍在）
  // 与全局时间范围——日期维度由顶部选日控件（workbenchDay）承载，本视图实际生效 = 搜索 + 优先级；
  // 日历不提供优先级条件（按日期组织任务），不被其他视图遗留的优先级选择隐性过滤（日期范围/状态仍生效）
  // 概览已是纯仪表盘（2026-10 用户决策：列表整体移除），不消费筛选结果；
  // 以下分支仅服务工作台与日历
  const filtered = useMemo(() => {
    if (view === "workbench") {
      return applyFilters(views, { ...filter, status: "all", dateFrom: null, dateTo: null });
    }
    if (view === "calendar") {
      return applyFilters(views, { ...filter, priorities: [] });
    }
    return applyFilters(views, filter);
  }, [views, filter, view]);
  // 概览统计（固定头部 StatsCard 专用：单点 useMemo，组件零内联计算）。
  // 洞察面板的时间投入不走本派生——其组件内自调 computeMonthInvestment（月锚点随翻页变化，见 InsightsPanel）
  const overviewStats = useMemo(() => computeOverviewStats(views), [views]);

  // 编辑对象从原始 tasks 取（草稿被 views 排除，但抽屉要能继续编辑它），status 现算补齐
  const editingTask = useMemo(() => {
    if (!editingId) return null;
    const raw = tasks.find((t) => t.id === editingId);
    return raw ? { ...raw, status: computeAutoStatus(raw, { now: new Date() }) } : null;
  }, [editingId, tasks]);

  const calendarAnchor = useCalendarStore((s) => s.anchor);
  // 逾期面板是工作台的常驻获取入口，不应因当前状态筛选切到「已完成」等而消失；
  // 仍遵守搜索与优先级条件。计数与面板表达「全部当前逾期」：即使某任务同时因
  // scheduledDates 属于选中日、已显示在「当日任务」，也不能再把它从逾期计数剔除——
  // 否则会出现卡片标「逾期」、顶部却显示「逾期 0」的自相矛盾。
  const workbenchOverdueTasks = useMemo(() => {
    const withoutStatus = applyFilters(views, { ...filter, status: "all", dateFrom: null, dateTo: null });
    return withoutStatus.filter((task) => task.status === "overdue").sort((a, b) => a.sortOrder - b.sortOrder);
  }, [views, filter]);
  // 状态筛选栏只在日历渲染（2026-10 用户决策：概览已移除筛选栏与工具行、工作台本就无此栏），
  // 计数口径 = 当前展示月。未安排任务同样有 scheduledDates，直接按所属月计数。
  const countViews = useMemo(() => {
    if (view === "calendar") {
      const monthPrefix = `${toDateKey(calendarAnchor).slice(0, 7)}`;
      const monthTasks = views.filter((v) => scheduledSpanOverlaps(v, `${monthPrefix}-01`, `${monthPrefix}-31`));
      return monthTasks;
    }
    return views;
  }, [views, view, calendarAnchor]);

  // 模块内容区工具行：搜索 / 组合筛选 / Excel 导入导出（日历与工作台渲染；概览已整体移除——
  // 2026-10 用户决策，仪表盘纯净化；快捷键已于 2026-10 整体下线，搜索框聚焦 ref 链路随之移除）。
  // 行首插槽：工作台 = 「返回日历」回退（如有）+ 选日控件（WorkbenchDayPicker）；
  // 日历 = 锚点月标题（CalendarLeadingBar）。都与右侧操作组同一行、items-center 高度对齐
  const toolbar = (
    <ViewToolbar
      className="mb-4"
      onRefresh={() => {
        initTasks();
        initNotes();
        initMessages();
        setRefreshVersion((version) => version + 1);
      }}
      leading={
        view === "workbench" ? (
          <div className="flex items-center gap-2">
            {returnView === "calendar" && (
              <button
                onClick={goBackToReturnView}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
              >
                <ArrowLeft className="size-4" />
                {settings.language === "zh-CN" ? "返回日历" : "Back to calendar"}
              </button>
            )}
            <WorkbenchDayPicker />
          </div>
        ) : view === "calendar" ? (
          <CalendarLeadingBar />
        ) : view === "notes" ? (
          // 备忘行首单日选择器（2026-10-18 用户决策：左上角 + 单日，记于锚点）
          <NotesDayPicker />
        ) : undefined
      }
      trailing={view === "calendar" ? <CalendarActionsMenu /> : undefined}
    />
  );

  if (!booted) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />

      {/* 各视图统一画布宽度：全宽自适应（2026-10 用户决策：勿写死上限——1400px 封顶在宽屏
          两侧流出大片空白），仅保留 px-4 边距；TopBar 内层容器同款，两缘对齐关系不变。
          刻意无底部预留 padding（2026-10 用户决策：内容一屏放得下时页面必须零滚动——
          pb-28 幻影留白曾把文档撑出视口多出一段「空滚」）；底部浮动件的可见性改由各自 sticky 承担 */}
      <main className={cn("w-full px-4", view === "all" ? "pt-0" : "pt-4")}>
        {/* 概览头部固定在顶栏正下方（2026-10 用户决策：状态筛选栏与工具行整体移出概览——
            仪表盘纯净化，仅统计卡固定；搜索/筛选/Excel 入口只在日历与工作台）。
            69px = 顶栏实测高度；z-20 低于 TopBar z-30。内层 pt-4 保持原有顶部间距。
            等高占位维持列表起点，ResizeObserver 处理高度变化。 */}
        {view === "all" && (
          <>
            <div ref={overviewHeaderRef} className="fixed inset-x-0 top-[69px] z-20 bg-background px-4 pb-2 pt-4">
              <StatsCard stats={overviewStats} />
            </div>
            <div aria-hidden="true" style={{ height: overviewHeaderHeight }} />
            {/* 洞察面板在滚动流（固定头部不膨胀）：多维度统计置于折叠列表之上 */}
            <InsightsPanel views={views} />
          </>
        )}

        {/* 只读状态筛选器（日历）：改变查看视角，不改变任何任务状态；计数口径见上方 countViews。
            概览已整体移除筛选栏与工具行（2026-10 用户决策）；工作台不渲染——三栏+逾期面板
            本身已是状态维度，且顶部条已有四个类别的计数，再加筛选栏属同构冗余 */}
        {view === "calendar" && (
          <div className="mb-4">
            <StatusFilterBar value={filter.status} onChange={setStatus} views={countViews} />
          </div>
        )}

        {view !== "all" && toolbar}

        {view === "workbench" && <WorkbenchView views={filtered} overdueTasks={workbenchOverdueTasks} />}
        {view === "calendar" && <CalendarView views={filtered} />}
        {/* 备忘 = 独立任务暂存池（2026-10-18）：自订阅 useNoteStore，不消费任务 filtered */}
        {view === "notes" && <NotesView />}
        {/* 概览 = 纯统计仪表盘（2026-10 用户决策：任务列表整体移除）——固定统计卡 + 洞察面板即全部 */}
      </main>

      {editingTask && <TaskEditor task={editingTask} />}
      {noteEditor && <NotesEditor />}
      {settingsOpen && <SettingsPanel />}
      {/* 选中操作条：多选任务后底部浮出（批量删除等），自选门控、无选中不渲染 */}
      <SelectionBar />
      {/* 删除确认统一由应用内 AlertDialog 承接：任务行、选中条、快捷键与日历按日期删除共用 */}
      <ConfirmDialog />
    </div>
  );
}

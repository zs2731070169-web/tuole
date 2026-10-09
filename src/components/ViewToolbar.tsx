// 模块内容区工具行：搜索 + 筛选条件 + Excel 导入导出 + 共用「新建」——三个视图共用，
// 在 routes/index.tsx 渲染于 StatusFilterBar 之下、各模块内容之上；
// 顶栏（TopBar）只保留品牌 / 视图切换 / 设置等全局项，不放模块级控件。
// 快捷键已于 2026-10 整体下线（用户决策：使用频率低），搜索框聚焦 ref 链路随之移除。
// 「概览」是纯查看视图：不渲染新建按钮（新建入口只在工作台/日历）。
// 筛选条件全部平铺（无弹层）：工作台 = 优先级行内组；日历 = 日期范围（按日期组织任务，
// 优先级在该视图冗余）；「概览」= 优先级 + 日期范围。原 FilterPanel 弹层已删除。
import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFilterStore } from "../stores/useFilterStore";
import { useTaskStore } from "../stores/useTaskStore";
import { useUiStore } from "../stores/useUiStore";
import { useCalendarStore } from "../stores/useCalendarStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { todayKey } from "../lib/date";
import { t } from "../lib/i18n";
import { PRIORITY_OPTIONS } from "../shared/constants";
import type { Priority } from "../shared/types";
import { SearchBox } from "./SearchBox";
import { DateRangeField } from "./DateRangeField";
import { TaskIOButtons } from "./TaskIOButtons";

interface Props {
  className?: string;
  onRefresh: () => void;
  /** 行首插槽（mr-auto 钉在左端，与右侧工具组同行对齐）：如工作台的「返回日历」回退入口，由 routes 按条件传入 */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function ViewToolbar({ className, leading, trailing, onRefresh }: Props) {
  const keyword = useFilterStore((s) => s.filter.keyword);
  const setKeyword = useFilterStore((s) => s.setKeyword);
  const view = useUiStore((s) => s.view);
  const calendarDeleteMode = useCalendarStore((s) => s.deleteMode);
  const isCalendarDeleting = view === "calendar" && calendarDeleteMode;
  const lang = useSettingsStore((s) => s.settings.language);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  const handleRefresh = () => {
    onRefresh();
    setRefreshing(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      setRefreshing(false);
      refreshTimer.current = null;
    }, 650);
    toast.success(t("action.refreshed", lang), { duration: 3000 });
  };

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-x-4 gap-y-2", className)}>
      {leading && <div className={cn("mr-auto max-w-full shrink-0", isCalendarDeleting && "w-full")}>{leading}</div>}
      {!isCalendarDeleting && <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 max-sm:w-full max-sm:justify-start">
        {view !== "all" && <NewTaskButton />}
        <SearchBox value={keyword} onSearch={setKeyword} className="w-72 max-w-full max-sm:min-w-48 max-sm:flex-1" />
        {/* 优先级只给「概览」/工作台：日历按日期组织任务，优先级筛选在该视图冗余 */}
        {view !== "calendar" && <PriorityInlineFilter />}
        {/* 日期范围给「概览」/日历；工作台按选中日锚定，不参与 */}
        {view !== "workbench" && <DateRangeInlineFilter />}
        <div className="flex items-center gap-1 border-l border-border/70 pl-2 sm:pl-3">
          <button
            type="button"
            onClick={handleRefresh}
            aria-label={t("action.refresh", lang)}
            title={t("action.refresh", lang)}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden="true" />
          </button>
          <TaskIOButtons />
          {trailing}
        </div>
      </div>}
    </div>
  );
}

// 共用「新建」入口（draft 标记——未点「保存」前任何列表/日历格/计数不渲染）。
// 统一口径：创建「未安排草稿」停靠在所属日（未安排与进行中一样跟着日期走、按日隔离）——
// 工作台停靠选中日、日历停靠选中格、概览无新建入口（纯查看）。
// **日历选中今天之前的格子 = 按钮整体禁用（2026-10-10 用户决策：过去日仅查看，不允许新建；
// 该场景废弃「回退今天」的静默换目标——灰化 + 悬停说明比悄悄改天更可预期）**。工作台则始终
// 精确使用当前选中日（含过去日）。保存后进入该日「未安排」栏；
// 正式开展走「安排」/拖入「进行中」。仅工作台/日历渲染本按钮
function NewTaskButton() {
  const lang = useSettingsStore((s) => s.settings.language);
  const view = useUiStore((s) => s.view);
  const openEditor = useUiStore((s) => s.openEditor);
  const calendarSelectedDay = useCalendarStore((s) => s.selectedDay);
  // 禁用判定订阅实时选中格（非原生 disabled：title 悬停说明依赖元素可命中指针事件）
  const pastDayPicked =
    view === "calendar" && !!calendarSelectedDay && calendarSelectedDay < todayKey();

  const onClick = () => {
    if (pastDayPicked) return;
    const today = todayKey();
    let day = today;
    if (view === "workbench") {
      day = useUiStore.getState().workbenchDay;
    } else if (view === "calendar") {
      const picked = useCalendarStore.getState().selectedDay;
      // 点击时点复核过去日（最后防线）：pastDayPicked 是渲染帧快照（todayKey() 渲染期求值），
      // 应用跨午夜静置无任何 store 写入 → 不重渲染 → 闭包里的判定停留在昨天——「昨天的今天」
      // 会从这里漏过去停靠成过去日草稿。用点击时刻的新鲜 today 现算拦截
      if (picked != null && picked < today) return;
      day = picked ?? today;
    }
    const draft = useTaskStore.getState().createTask({
      title: "",
      draft: true,
      scheduledDates: [day],
      startedAt: null,
      parkedDate: null,
    });
    openEditor(draft.id);
  };

  return (
    <button
      onClick={onClick}
      aria-disabled={pastDayPicked || undefined}
      // 禁用态把原因并入 aria-label：title 读屏默认不播报、键盘聚焦也不显示气泡，
      // 悬停说明只覆盖鼠标通道（2026-10-10 审查修复）
      aria-label={pastDayPicked ? `${t("action.new", lang)}，${t("action.newPastDay", lang)}` : t("action.new", lang)}
      title={pastDayPicked ? t("action.newPastDay", lang) : t("action.new", lang)}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] font-medium text-foreground transition-colors",
        pastDayPicked ? "cursor-not-allowed opacity-40" : "hover:bg-muted active:scale-95",
      )}
    >
      <Plus className="size-4" />
      <span className="hidden sm:inline">{lang === "zh-CN" ? "新建" : "New"}</span>
    </button>
  );
}

// 「概览」/日历视图行内日期范围筛选：单控件 DateRangeField（Popover + 双月范围日历，契约要求的唯一形态）；
// 匹配语义：活动任务按安排日、已结束任务按完成日，任一命中即展示。
// 工作台不渲染本组件：时间范围不参与该视图（routes/index 在 workbench 分支会清空遗留条件）
function DateRangeInlineFilter() {
  const lang = useSettingsStore((s) => s.settings.language);
  const dateFrom = useFilterStore((s) => s.filter.dateFrom);
  const dateTo = useFilterStore((s) => s.filter.dateTo);
  const setDateRange = useFilterStore((s) => s.setDateRange);

  return (
    <div
      role="group"
      aria-label={lang === "zh-CN" ? "按日期范围筛选（仅查看）" : "Filter by date range (view only)"}
      className="flex items-center gap-1 rounded-xl bg-muted/60 p-1"
    >
      <span className="hidden px-1 text-[11px] font-medium text-muted-foreground sm:inline">
        {lang === "zh-CN" ? "日期" : "Date"}
      </span>
      <div className="w-44">
        <DateRangeField
          start={dateFrom}
          end={dateTo}
          lang={lang}
          placeholder={lang === "zh-CN" ? "不限日期" : "Any date"}
          size="sm"
          onChange={({ start, end }) => setDateRange(start, end)}
        />
      </div>
    </div>
  );
}

// 工作台行内优先级筛选：全部/高/中/低 分段开关（样式与 StatusFilterBar 一致，选中 = 卡片浮起）。
// 「全部」= 不过滤（priorities 空），任何时刻至少一个点亮：取消最后一个具体优先级自动回落「全部」
function PriorityInlineFilter() {
  const lang = useSettingsStore((s) => s.settings.language);
  const priorities = useFilterStore((s) => s.filter.priorities);
  const togglePriority = useFilterStore((s) => s.togglePriority);
  const clearPriorities = useFilterStore((s) => s.clearPriorities);

  const concrete = PRIORITY_OPTIONS.filter((p) => p.value !== "none");
  const allOn = priorities.length === 0;

  return (
    <div
      role="group"
      aria-label={lang === "zh-CN" ? "按优先级筛选（仅查看）" : "Filter by priority (view only)"}
      className="flex items-center gap-1 rounded-xl bg-muted/60 p-1"
    >
      <span className="hidden px-1 text-[11px] font-medium text-muted-foreground sm:inline">
        {lang === "zh-CN" ? "优先级" : "Priority"}
      </span>
      <button
        onClick={clearPriorities}
        aria-pressed={allOn}
        className={cn(
          "rounded-lg px-2.5 h-7 text-[12px] font-medium transition-colors",
          allOn
            ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {lang === "zh-CN" ? "全部" : "All"}
      </button>
      {concrete.map((p) => {
        const on = priorities.includes(p.value as Priority);
        return (
          <button
            key={p.value}
            onClick={() => togglePriority(p.value as Priority)}
            aria-pressed={on}
            className={cn(
              "rounded-lg px-2.5 h-7 text-[12px] font-medium transition-colors",
              on
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {lang === "zh-CN" ? p.labelZh : p.labelEn}
          </button>
        );
      })}
    </div>
  );
}

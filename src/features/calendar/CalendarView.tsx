// 日历视图：仅月视图（周视图已下线）；每个日期格既是「放置容器」（拖入即改期）也是「跳转入口」——
// 两段式：第一次点击仅选中高亮；再次点击已选中的格子（或其中任务 chip）跳转到工作台查看该天。
// 格内零弹窗（点任务不弹编辑抽屉）；新建走 ViewToolbar 的共用「新建」按钮（排到选中格/今天）。
// 状态用颜色区分；无任何改状态操作
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addMonths, format, isSameDay, isSameMonth } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { CalendarDays, Check, LocateFixed, MoreHorizontal, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import type { TaskView } from "../../shared/types";
import { monthCarouselWindow, monthGrid, toDateKey, todayKey } from "../../lib/date";
import { t } from "../../lib/i18n";
import { taskIdsOnScheduledDays, unscheduledTaskIdsParkedOnDays } from "../../shared/calendar";
import { calendarTaskOnDay } from "../../shared/taskDates";
import { useTaskStore } from "../../stores/useTaskStore";
import { useUiStore } from "../../stores/useUiStore";
import { useCalendarStore } from "../../stores/useCalendarStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useConfirmStore } from "../../stores/useConfirmStore";

const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 月视图固定为 6 行。把轮播视口与日期轨道的网格行高锁在同一组几何参数上，
// 不再根据当月内容实时测量高度，也就不会在 5/6 周切换、展开任务或滚动时重新撑动页面。
// 92px 是日期格的最小高度，5 个 4px 间隙来自 gap-1。
const CALENDAR_BLOCK_HEIGHT = 6 * 92 + 5 * 4;
const CALENDAR_ROW_STEP = 92 + 4;

// 格内 chip 收起态上限 2 条：92px 固定格高下 chip 区 = 92 − 边框 2 − 上下内边距 12（p-1.5）
// − 头部行 13.75 − mb-0.5 间隙 2 = 62.25px；2 条 chip（17.75 × 2 + 4 间隙 ≈ 40px）+
// 「+N 更多」第三项（约 13px）≈ 56px 放下、余量约 6px。「+N 更多」入口在 chip 区左下角
// 作为第三项显示（2026-10 用户决策：每格最多 2 条任务，更多收进左下角入口，不再放头部行）；
// 完整列表由「+N 更多」浮层日清单承载。头部行保持 leading-tight + mb-0.5 的紧凑几何，
// 勿放宽行高/间距或给格子加边框——否则第 2 条 chip / 入口会被挤进隐藏滚动区静默裁掉
// （滚动条 display:none 不可见，2026-10「+N 消失」同根因；格高按 px 锁定而间距走 rem，
// 浏览器默认字号 >16.5px 时同样挤出该余量，Electron 端固定 16px 不受影响）
const MAX_CHIPS = 2;

// 日历工具条左组（渲染在 ViewToolbar 行首 leading 槽，与右侧操作组同一行对齐）：
// 当前锚点月标题 + 拖拽导航提示。仅月视图（周视图已按需求下线），日历自身不再有独立工具条
export function CalendarLeadingBar() {
  const lang = useSettingsStore((s) => s.settings.language);
  const anchor = useCalendarStore((s) => s.anchor);
  const goToCurrentMonth = useCalendarStore((s) => s.goToCurrentMonth);
  const deleteMode = useCalendarStore((s) => s.deleteMode);
  const deleteDays = useCalendarStore((s) => s.deleteDays);
  const startDeleteMode = useCalendarStore((s) => s.startDeleteMode);
  const cancelDeleteMode = useCalendarStore((s) => s.cancelDeleteMode);
  const tasks = useTaskStore((s) => s.tasks);
  const deleteTasks = useTaskStore((s) => s.deleteTasks);
  const locale = lang === "zh-CN" ? zhCN : enUS;
  // 删除范围 = 所选日期格内的**全部**任务（2026-10 用户决策：删除模式下未安排任务也进
  // 停靠日格显示，「未安排 N」补充开关废弃）——执行期覆盖该日的任务 + 停靠在该日的未安排
  //（parkedDate 缺失兜底今天），选中格子即连带删除，不再需要单独开关
  const dayTaskIds = useMemo(() => taskIdsOnScheduledDays(tasks, deleteDays), [tasks, deleteDays]);
  const parkedUnscheduledIds = useMemo(
    () => unscheduledTaskIdsParkedOnDays(tasks, deleteDays, todayKey()),
    [tasks, deleteDays],
  );
  const taskIds = useMemo(
    () => [...dayTaskIds, ...parkedUnscheduledIds],
    [dayTaskIds, parkedUnscheduledIds],
  );

  const confirmDelete = async () => {
    if (taskIds.length === 0) return;
    // 确认文案单口径：N 天 · M 项任务（M 已含停靠在该日的未安排）
    const message = t("confirm.deleteCalendarDays", lang)
      .replace("{days}", String(deleteDays.length))
      .replace("{tasks}", String(taskIds.length));
    const confirmed = await useConfirmStore.getState().ask(message);
    if (!confirmed) return;
    deleteTasks(taskIds);
    useUiStore.getState().clearSelection();
    cancelDeleteMode();
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-y-2", deleteMode ? "w-full gap-x-3" : "gap-x-4")}>
      <div className="flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-lg bg-status-today/15">
          <CalendarDays className="size-4 text-status-today" />
        </div>
        <span className="inline-block w-20 text-[13px] font-semibold tabular-nums text-foreground">
          {/* 保留 9月/10月原有文案，只固定标题槽位宽度，避免单双数字切换触发工具栏重排。 */}
          {format(anchor, "yyyy年M月", { locale })}
        </span>
      </div>

      {deleteMode ? (
        <>
          {/* 模式徽标：一眼可辨「点格子 = 圈选待删」——2026-10 用户反馈首用迷惑，
              月份标题与操作件之间补显式模式标识，危险色只出现在这里和删除按钮 */}
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-status-overdue/10 px-2.5 text-[12px] font-semibold text-status-overdue">
            <Trash2 className="size-3.5" />
            {t("calendar.deleteByDay", lang)}
          </span>
          {/* 选取摘要：中性灰底（统计是信息不是危险操作，勿染红——多色并排显乱） */}
          <span
            title={deleteDays.length === 0 ? t("calendar.deleteHint", lang) : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 text-[12px] font-medium tabular-nums",
              taskIds.length > 0 ? "bg-muted text-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {deleteDays.length > 0
              ? t("calendar.deleteSelection", lang)
                  .replace("{days}", String(deleteDays.length))
                  .replace("{tasks}", String(taskIds.length))
              : t("calendar.deleteHintShort", lang)}
          </span>
          {/* 「未安排 N」补充范围开关已删除（2026-10 用户决策）：未安排任务进停靠日格显示，
              选格删除连带停靠的未安排一起删，无需单独开关 */}
          {/* 动作组右锚 + 左侧分隔线：与左侧信息明确分区，取消带文字（裸 × 紧贴开关曾像其附属） */}
          <div className="ml-auto flex items-center gap-2 sm:border-l sm:border-border sm:pl-3">
            <button
              type="button"
              onClick={cancelDeleteMode}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
            >
              <X className="size-4" />
              {t("action.cancel", lang)}
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={taskIds.length === 0}
              title={deleteDays.length > 0 && taskIds.length === 0 ? t("calendar.deleteEmpty", lang) : undefined}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-status-overdue/40 bg-status-overdue/10 px-2.5 text-[13px] font-medium text-status-overdue transition-colors hover:bg-status-overdue/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              <Trash2 className="size-4" />
              {t("action.delete", lang)}
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              goToCurrentMonth();
              useUiStore.getState().clearSelection();
            }}
            aria-label={t("calendar.backToCurrentMonth", lang)}
            title={t("calendar.backToCurrentMonth", lang)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-status-today/30 bg-status-today/[0.06] px-2.5 text-[13px] font-medium text-status-today transition-colors hover:bg-status-today/10 active:scale-95"
          >
            <LocateFixed className="size-4" />
            <span className="hidden sm:inline">{t("calendar.backToCurrentMonth", lang)}</span>
          </button>
          <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground 2xl:inline">
            {lang === "zh-CN" ? "上下拖拽日期表格切换" : "Drag the grid vertically to navigate"}
          </span>
        </>
      )}
    </div>
  );
}

export function CalendarActionsMenu() {
  const lang = useSettingsStore((s) => s.settings.language);
  const startDeleteMode = useCalendarStore((s) => s.startDeleteMode);
  const deleteMode = useCalendarStore((s) => s.deleteMode);

  if (deleteMode) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("calendar.moreActions", lang)}
          title={t("calendar.moreActions", lang)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="text-status-overdue focus:text-status-overdue"
          onSelect={() => {
            useUiStore.getState().clearSelection();
            startDeleteMode();
          }}
        >
          <Trash2 />
          {t("calendar.deleteByDay", lang)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CalendarView({ views }: { views: TaskView[] }) {
  const lang = useSettingsStore((s) => s.settings.language);
  const locale = lang === "zh-CN" ? zhCN : enUS;
  const scheduleTo = useTaskStore((s) => s.scheduleTo);
  const tasks = useTaskStore((s) => s.tasks);
  // 点任务 chip / 再点已选中格 = 跳工作台查看该天（returnView 记录来源，工作台可「返回日历」）
  const openDayInWorkbench = useUiStore((s) => s.openDayInWorkbench);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const selectedIds = useUiStore((s) => s.selectedIds);
  // 弹窗（编辑抽屉）打开期间压制格子自身选中高亮：蓝色高亮框只允许「任务所在格」一个，
  // 任何路径都不再出现两个蓝框
  const editingOpen = useUiStore((s) => s.editingId !== null);
  // 月/周锚点在 useCalendarStore（不放局部 state）：状态筛选栏按「当前展示月」统计需读同一锚点；
  // 月/周切换入口在 CalendarLeadingBar（ViewToolbar 行首插槽）
  const anchor = useCalendarStore((s) => s.anchor);
  const [overDay, setOverDay] = useState<string | null>(null);
  // 选中的日期格：点击任意格后保持边框高亮，直到点其他格。
  // 放 useCalendarStore：ViewToolbar 的新建按钮要读它决定「排到选中格」的目标日
  const selectedDay = useCalendarStore((s) => s.selectedDay);
  const setSelectedDay = useCalendarStore((s) => s.setSelectedDay);
  const deleteMode = useCalendarStore((s) => s.deleteMode);
  const deleteDays = useCalendarStore((s) => s.deleteDays);
  const toggleDeleteDay = useCalendarStore((s) => s.toggleDeleteDay);
  const selectDeleteDay = useCalendarStore((s) => s.selectDeleteDay);
  const rangeSelectDeleteDay = useCalendarStore((s) => s.rangeSelectDeleteDay);
  const addDeleteDayRangeFromAnchor = useCalendarStore((s) => s.addDeleteDayRangeFromAnchor);
  const cancelDeleteMode = useCalendarStore((s) => s.cancelDeleteMode);
  // 「+N 更多」浮层日清单当前打开的日期格（同屏最多一格）：任务多于上限时**悬停入口**弹出只读
  // 完整列表（2026-10 用户决策：由点击改为鼠标经过自动弹出）；移走经宽限定时器自动关闭，
  // Esc/点外部由 Radix onOpenChange 兜底，同屏互斥由函数式 set 保护
  const [dayListDay, setDayListDay] = useState<string | null>(null);
  // 悬停开合的宽限定时器：入口 → 浮层本体之间的移动间隙不断开（240ms 宽限）；
  // 关闭回调带 key 校验，只关自己那格的浮层——刚悬停到新格时不被旧格的延时关闭误清
  const dayListCloseTimer = useRef<number | null>(null);
  const cancelDayListClose = () => {
    if (dayListCloseTimer.current !== null) {
      window.clearTimeout(dayListCloseTimer.current);
      dayListCloseTimer.current = null;
    }
  };
  const scheduleDayListClose = (key: string) => {
    cancelDayListClose();
    dayListCloseTimer.current = window.setTimeout(() => {
      dayListCloseTimer.current = null;
      setDayListDay((cur) => (cur === key ? null : cur));
    }, 240);
  };
  // 组件卸载（含视图切换）时清掉挂着的关闭定时器
  useEffect(() => () => cancelDayListClose(), []);
  const deleteDaySet = useMemo(() => new Set(deleteDays), [deleteDays]);
  const carousel = useMemo(() => monthCarouselWindow(anchor), [anchor]);
  const visibleDays = useMemo(() => carousel.days.map(toDateKey), [carousel]);
  const currentDaySet = useMemo(() => new Set(monthGrid(anchor).map(toDateKey)), [anchor]);
  const currentOffset = carousel.currentRow * CALENDAR_ROW_STEP;
  const nextOffset = carousel.nextRow * CALENDAR_ROW_STEP;
  const allTaskCountByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      for (const day of visibleDays) {
        if (calendarTaskOnDay(task, day)) counts.set(day, (counts.get(day) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks, visibleDays]);

  // 删除模式仅属于本次日历停留；切去其他视图后自动退出，避免回来时误把普通点击当成删除选择。
  useEffect(() => () => cancelDeleteMode(), [cancelDeleteMode]);

  // —— 无缝轮播：前/本/后月共用一条连续日期轨道，重叠的周只绘制一次。——
  // 拖动直改 transform；松手越阈值滑到相邻月份的起始周，再换锚点重新定位轨道。
  // Pointer Events + 位移 >6px 才 setPointerCapture：拖出网格仍持续收到 move/up
  // （勿用 mouseleave 结束拖拽——上缘上拖会因表格上移、光标出界被提前截断）；
  // 纯点击不捕获，click 正常落在格子上，不会因捕获重定向废掉格子交互
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragNav = useRef({ down: false, startX: 0, startY: 0, dy: 0, moved: false, animating: false });

  // 删除模式选日语义派发（Finder 选区模型，鼠标点击 / 键盘 / 格内 chip 共用同一动词表）：
  // ⌘⇧+点击 = 锚点→该日闭区间**并入**现有选中（不连续多段，Finder 同款组合键）；
  // ⌘/Ctrl+点击 = 单日勾选/取消（散点加减，不破坏其余选中）；
  // Shift+点击 = 选中恰好「锚点→该日」闭区间（整体替换），锚点保持不动、可反复收窄/放宽；
  // 普通点击 = 只选这一天（重置为单日）并把锚点移到该日
  const dispatchDeleteDayPick = (key: string, mods: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (mods.shiftKey && (mods.metaKey || mods.ctrlKey)) addDeleteDayRangeFromAnchor(key);
    else if (mods.metaKey || mods.ctrlKey) toggleDeleteDay(key);
    else if (mods.shiftKey) rangeSelectDeleteDay(key);
    else selectDeleteDay(key);
  };

  // 锚点变化后在绘制前复位：新旧轨道在当前视窗显示同一组日期，无闪烁跳帧。
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = `translateY(${-currentOffset}px)`;
    track.style.pointerEvents = "auto";
    dragNav.current.animating = false;
  }, [anchor, currentOffset]);

  // 浮层（+N 日清单等 body 传送门层）内的指针/点击事件会沿 React 树冒泡回轮播视口的 handlers
  //（Radix Portal 只搬 DOM 节点、不切断合成事件传播）：不拦的话在浮层里按住拖动会连带动底下
  // 的日历、点击也会被当作拖后点击吞掉。popper 包裹层是 DOM 真实祖先，closest 可跨传送门判定
  const isInsideFloatingLayer = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest("[data-radix-popper-content-wrapper]");

  const onGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isInsideFloatingLayer(e.target)) return;
    if (e.button !== 0 || dragNav.current.animating) return;
    // 每次按下都清掉上一手势的「拖拽后吞 click」痕迹：pointercancel 结束的手势没有后续 click
    // 来消费 moved，残留标记会把本次（可能是选择/连选轻点）的 click 误吞
    dragNav.current.moved = false;
    dragNav.current = { down: true, startX: e.clientX, startY: e.clientY, dy: 0, moved: false, animating: false };
    if (trackRef.current) trackRef.current.style.transition = "none";
  };

  const onGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragNav.current;
    if (!d.down || !trackRef.current) return;
    d.dy = e.clientY - d.startY;
    // 删除模式里「点选日期」是主操作：鼠标轻抖（常见 7-10px 竖向）不该把一次点击变成拖月导航
    // 还吞掉 click（表现为「点了没反应 + 网格晃一下」）。该模式下阈值提高到 10px 且要求竖向占优；
    // 正常的划动切月不受影响
    const dragThreshold = deleteMode ? 10 : 6;
    const verticalDominant = !deleteMode || Math.abs(d.dy) > Math.abs(e.clientX - d.startX);
    if (!d.moved && Math.abs(d.dy) > dragThreshold && verticalDominant) {
      d.moved = true;
      // 开始拖拽即收起「+N 更多」浮层：拖后的 click 被 stopPropagation，Radix 的延迟外部关闭
      // （deferPointerDownOutside 依赖 click 冒泡到 document）不会触发，必须显式收
      setDayListDay(null);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 捕获失败不阻塞拖拽 */
      }
    }
    // 当前月份视窗在连续轨道上的起始周是拖动基准位。
    // 轨道只预备了相邻月份所需的日期，越过两端时钳住位置，避免露出空白。
    const position = Math.max(-nextOffset, Math.min(0, -currentOffset + d.dy));
    trackRef.current.style.transform = `translateY(${position}px)`;
  };

  const onGridPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragNav.current.moved) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* 未捕获时忽略 */
      }
    }
    onGridDragEnd();
  };

  const onGridDragEnd = () => {
    const d = dragNav.current;
    if (!d.down || !trackRef.current) return;
    d.down = false;
    const track = trackRef.current;
    const threshold = Math.min(140, CALENDAR_BLOCK_HEIGHT * 0.25);
    track.style.transition = "transform 260ms ease-out";
    if (d.dy <= -threshold || d.dy >= threshold) {
      // 越过阈值：滑到相邻月份的起始周，日期不会在接缝处重复。
      const dir = d.dy < 0 ? 1 : -1;
      d.animating = true;
      track.style.pointerEvents = "none";
      track.style.transform = `translateY(${dir === 1 ? -nextOffset : 0}px)`;
      window.setTimeout(() => {
        const { anchor: a, setAnchor: setA } = useCalendarStore.getState();
        setA(addMonths(a, dir));
      }, 260);
    } else {
      // 未达阈值：弹回当前月份。
      track.style.transform = `translateY(${-currentOffset}px)`;
    }
  };

  const onGridClickCapture = (e: React.MouseEvent) => {
    if (isInsideFloatingLayer(e.target)) return;
    if (dragNav.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragNav.current.moved = false;
    }
  };

  const byDay = new Map<string, TaskView[]>();
  // 活动任务覆盖执行期内每一天；已完成任务只进完成日格。
  // 未安排任务进「停靠日」格（未安排与进行中一样跟着日期走、按日隔离；parkedDate 缺失兜底今天），
  // 这是日历里未安排任务的唯一可见入口（下方托盘已下线）。删除模式下**同样进格**
  //（2026-10 用户决策：选格删除连带停靠在该日的未安排一起删，「未安排 N」补充开关已废弃——
  // 删除范围口径见 CalendarLeadingBar 的 taskIds 组合，与格内显示同源不再有不一致）
  for (const t of views) {
    if (!t.scheduledDate && t.status !== "done") {
      if (t.status === "unscheduled") {
        const parkKey = t.parkedDate ?? toDateKey(new Date());
        if (!byDay.has(parkKey)) byDay.set(parkKey, []);
        byDay.get(parkKey)!.push(t);
      }
      continue;
    }
    for (const day of visibleDays) {
      if (!calendarTaskOnDay(t, day)) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(t);
    }
  }

  // 「+N 更多」浮层受控态回收：所在格不再满足条件（筛选收窄 / 进入删除模式）时清空 dayListDay，
  // 否则 Radix 卸载不触发 onOpenChange、残留 open=true 会让浮层在条件恢复后无端自开。
  // byDay 每次渲染由 views 重建，依赖 views 而非 byDay 本身
  useEffect(() => {
    if (dayListDay === null) return;
    if (deleteMode || !currentDaySet.has(dayListDay)) {
      setDayListDay(null);
      return;
    }
    const visibleCount = (byDay.get(dayListDay) ?? []).filter((v) => v.title.trim() !== "").length;
    if (visibleCount <= MAX_CHIPS) setDayListDay(null);
  }, [dayListDay, views, deleteMode, currentDaySet]);

  return (
    <div className="space-y-3">
      {/* 月/周切换 + 锚点月标题 + 拖拽提示已上移到 ViewToolbar 行首（CalendarLeadingBar），
          与右侧操作组同一行上下对齐；日历自身不再有独立工具条 */}

      {/* 星期头 */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {(lang === "zh-CN" ? WEEKDAYS_ZH : WEEKDAYS_EN).map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* 固定 6 行视口在一条连续周轨道上移动；日期只渲染一次，月份之间不会复制周。 */}
      <div
        onPointerDown={onGridPointerDown}
        onPointerMove={onGridPointerMove}
        onPointerUp={onGridPointerUp}
        onPointerCancel={onGridDragEnd}
        onClickCapture={onGridClickCapture}
        className="calendar-carousel relative isolate overflow-hidden"
        style={{ height: CALENDAR_BLOCK_HEIGHT }}
      >
        <div
          ref={trackRef}
          className="grid grid-cols-7 gap-1 select-none"
          style={{ transform: `translateY(-${currentOffset}px)` }}
        >
        {carousel.days.map((day) => {
          const key = toDateKey(day);
          const inMonth = isSameMonth(day, anchor);
          const interactiveDay = currentDaySet.has(key);
          const isToday = isSameDay(day, new Date());
          const list = byDay.get(key) ?? [];
          // 格内任务被选中（selectedIds 命中）时，所在格子边框同步高亮
          const hasSelectedTask = list.some((t) => selectedIds.includes(t.id));
          // 空标题草稿不参与 chip 渲染：新建点击瞬间到抽屉回收之间，格内不出现空壳条，
          // 也不计入 chips 数量——「+N 更多」的显隐与计数、浮层日清单均不受草稿干扰
          const chips = list.filter((t) => t.title.trim() !== "");
          const selectedForDelete = deleteDaySet.has(key);
          const allTaskCount = allTaskCountByDay.get(key) ?? 0;
          return (
            <div
              key={key}
              // 两段式交互：第一次点击任意格 = 仅选中高亮；再次点击「当前已选中」的格子 = 跳工作台
              // 查看该天（日历格内无任何新建/编辑弹窗）。点其他格 = 移动选中，不弹窗；
              // 移动选中时顺带清掉遗留的任务选中态——否则原格会因 selectedIds 命中（点 chip 后）一直保持高亮
              onClick={(event) => {
                // 点格背景显式收起「+N 更多」浮层：chip / +N 入口自带 stopPropagation 不达这里，
                // 而被 stopPropagation 的点击同样不触发 Radix 的延迟外部关闭（见 onGridPointerMove 注释）。
                // 本格浮层正开着时，点同一格 = 只收起浮层、不跳工作台（2026-10 用户决策：
                // 打开状态下点相同格子不应立即跳转——这一下视为「收起」）
                const dayListWasOpen = dayListDay === key;
                setDayListDay(null);
                if (deleteMode) {
                  // Finder 选区模型（2026-10 用户决策：旧 toggle 累加 + 锚点漂移语义不顺手，已废弃）：
                  // 普通点击 = 只选这一天（重置为单日）并把锚点移到该日；
                  // Shift+点击 = 选中恰好「锚点→该日」闭区间（整体替换，段外自动取消），
                  //              锚点保持不动——可继续 Shift 点其他日反复收窄/放宽范围；
                  // ⌘/Ctrl+点击 = 单日勾选/取消（散点加减，不破坏其余选中），锚点随之移动
                  if (interactiveDay) {
                    dispatchDeleteDayPick(key, event);
                  }
                  return;
                }
                if (!interactiveDay) return;
                if (selectedDay !== key) {
                  setSelectedDay(key);
                  clearSelection();
                  return;
                }
                if (dayListWasOpen) return; // 这一下只用于收起本格浮层，不触发跳转
                // 再次点击已选中的格子 = 跳工作台查看该天。
                // 原「再点新建任务 + 弹编辑抽屉」已按需求完全下线——日历不再弹出任何编辑弹窗
                openDayInWorkbench(key);
              }}
              onKeyDown={(e) => {
                if (!deleteMode || !interactiveDay || (e.key !== "Enter" && e.key !== " ")) return;
                e.preventDefault();
                // 键盘与鼠标同一 Finder 选区模型（Enter = 普通选择，Shift+Enter = 连选，
                // ⌘/Ctrl+Enter = 散点开关，⌘⇧+Enter = 并入区间）
                dispatchDeleteDayPick(key, e);
              }}
              role={deleteMode && interactiveDay ? "checkbox" : undefined}
              tabIndex={deleteMode && interactiveDay ? 0 : undefined}
              aria-checked={deleteMode && interactiveDay ? selectedForDelete : undefined}
              aria-label={
                deleteMode && interactiveDay
                  ? t("calendar.deleteDayAria", lang)
                      .replace("{date}", key)
                      .replace("{n}", String(allTaskCount))
                  : undefined
              }
              onDragOver={(e) => {
                if (deleteMode || !interactiveDay) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overDay !== key) setOverDay(key);
              }}
              onDragLeave={() => setOverDay(null)}
              onDrop={(e) => {
                if (deleteMode || !interactiveDay) return;
                e.preventDefault();
                setOverDay(null);
                // drop 落定即清拖拽态：任务换格后源卡片/源 chip 随之卸载，dragend 不再派发
                // 到已卸载元素（遗留非空 draggingStatus 会让工作台「拖入逾期」入口等拖拽派生
                // 状态卡死——与 WorkbenchView.onDrop 同款防御）
                useUiStore.getState().setDraggingStatus(null);
                useUiStore.getState().setDraggingTaskId(null);
                const id = e.dataTransfer.getData("text/task-id");
                if (id) scheduleTo(id, key); // 拖入某天 = 排期到该天
              }}
              className={cn(
                "relative flex h-[92px] min-h-0 flex-col overflow-hidden rounded-xl border p-1.5 transition-colors",
                inMonth ? "border-border/50 bg-card/40" : "border-transparent bg-muted/20 opacity-50",
                // 今天：始终以今日语义色填充显示（仅拖放悬停这一瞬态会盖过填充）
                isToday && "border-status-today/40 bg-status-today/[0.08]",
                deleteMode && "hover:border-status-overdue/40 hover:bg-status-overdue/[0.04]",
                // 拖放悬停：最高优先级的落点反馈（瞬态，ring 画在间隙里无碍）
                overDay === key && "border-primary bg-primary/[0.06] ring-2 ring-primary/40",
              )}
            >
              {/* 头部行：右上日期数字，保持 leading-tight + mb-0.5 紧凑几何（「+N 更多」入口已按
                  2026-10 用户决策移至下方 chip 区左下角第三项，不再与日期同行） */}
              <div
                className={cn(
                  "mb-0.5 text-right text-[11px] leading-tight tabular-nums",
                  isToday ? "font-bold text-status-today" : "text-muted-foreground",
                )}
              >
                {format(day, "d")}
              </div>
              <div className="calendar-cell-scroll min-h-0 flex-1 space-y-1">
                {chips.slice(0, MAX_CHIPS).map((t) => (
                  // 点任务 chip = 跳到工作台查看/操作该任务（不弹编辑抽屉）。
                  // 前提：所在格已被选中（未选中时这一下只选中本格，不跳转）。
                  // 跳转锚定日：活动任务锚定当前格日期；已结束任务锚定完成日——
                  // 工作台已完成栏按完成日分桶，锚安排日会看不到该任务。
                  // stopPropagation 避免触发日期格自身的两段式逻辑
                  <button
                    key={t.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      // 同上：stopPropagation 后 Radix 延迟外部关闭失效，点其他格 chip 时显式收浮层。
                      // 本格浮层正开着时，点 chip 与点格背景同一语义 = 只收起、不跳工作台
                      //（2026-10 用户决策：打开「+N 更多」后点格内任务不要直接跳转——
                      // 想跳走浮层里的条目或先收起再点）
                      const dayListWasOpen = dayListDay === key;
                      setDayListDay(null);
                      if (deleteMode) {
                        // 删除模式下点 chip = 点它所在的格，修饰键同格背景一致转发（同一格同一动词，
                        // 勿绕开 Finder 选区模型走隐藏语义）
                        dispatchDeleteDayPick(key, e);
                        return;
                      }
                      if (selectedDay !== key) {
                        setSelectedDay(key);
                        clearSelection();
                        return;
                      }
                      if (dayListWasOpen) return; // 这一下只用于收起本格浮层，不触发跳转
                      const finishedStamp = t.completedAt;
                      openDayInWorkbench(finishedStamp ? toDateKey(new Date(finishedStamp)) : key);
                    }}
                    className={cn(
                      "block w-full cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-opacity hover:opacity-75",
                      statusChip(t.status),
                    )}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                ))}
                {/* 溢出入口「+N 更多」：chip 区左下角第三项（2026-10 用户决策：每格最多 2 条任务，
                    更多收进左下角入口）→ 锚定本格的只读浮层日清单（92px 固定格高装不下更多 chip，
                    完整列表放浮层看）。**悬停入口自动弹出、移走自动关闭**（2026-10 用户决策，
                    原「点击打开」与头部关闭按钮均已废弃）：按下拖拽轮播期间划过不弹（dragNav.down）；
                    点击仍可打开（触屏无 hover 的兜底）；关闭 = 入口与浮层都移开（240ms 宽限）或
                    Esc/点外部（Radix onOpenChange 兜底）。删除模式不渲染（该模式按天圈选，头部已有任务计数）。
                    只给当前视窗日期挂触发器；轨道两端的离屏日期不参与当前交互。 */}
                {!deleteMode && interactiveDay && chips.length > MAX_CHIPS && (
                  <Popover
                    open={dayListDay === key}
                    onOpenChange={(open) => setDayListDay((cur) => (open ? key : cur === key ? null : cur))}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onMouseEnter={() => {
                          // 指针按住（拖月导航）期间划过不开浮层；松手后的悬停照常弹
                          if (dragNav.current.down) return;
                          cancelDayListClose();
                          setDayListDay(key);
                        }}
                        onMouseLeave={() => scheduleDayListClose(key)}
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelDayListClose();
                          setDayListDay(key);
                        }}
                        className="block w-fit max-w-full truncate rounded px-1 text-left text-[10px] font-medium leading-tight text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {t("calendar.moreTasks", lang).replace("{n}", String(chips.length - MAX_CHIPS))}
                      </button>
                    </PopoverTrigger>
                    {/* 传送门到 body：不受轮播视口 overflow-hidden / contain 裁剪，可向上翻转避让。
                        悬停在本体上 = 保持打开（撤下宽限关闭）；移开 = 宽限后自动关 */}
                    <PopoverContent
                      align="start"
                      className="w-64 p-2"
                      onMouseEnter={cancelDayListClose}
                      onMouseLeave={() => scheduleDayListClose(key)}
                    >
                      {/* 头部：日期 + 今天标记 + 当天任务总数（显式关闭按钮已随「悬停弹出」移除——
                          关闭 = 鼠标移开，Esc/点外部兜底） */}
                      <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[12px] font-semibold text-foreground">
                        {format(day, lang === "zh-CN" ? "M月d日" : "MMM d", { locale })}
                        {isToday && (
                          <span className="rounded bg-status-today/15 px-1 text-[11px] font-medium text-status-today">
                            {t("date.today", lang)}
                          </span>
                        )}
                        <span className="ml-auto font-normal text-muted-foreground">
                          {t("calendar.dayListCount", lang).replace("{n}", String(chips.length))}
                        </span>
                      </div>
                      {/* 正文：完整列表；点条目直接跳工作台（无「先选中格子」两段式——打开浮层
                          已是明确意图）。已结束任务锚完成日，与格内 chip 同口径 */}
                      <div className="max-h-72 space-y-1 overflow-y-auto">
                        {chips.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => {
                              setDayListDay(null);
                              const finishedStamp = task.completedAt;
                              openDayInWorkbench(finishedStamp ? toDateKey(new Date(finishedStamp)) : key);
                            }}
                            title={task.title}
                            className={cn(
                              "block w-full cursor-pointer truncate rounded px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition-opacity hover:opacity-75",
                              statusChip(task.status),
                            )}
                          >
                            {task.title}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* 选中高亮 = inset-0 覆盖层描边：外缘与格子自身边框完全重合（盖住 1px 原边框，呈单一亮蓝粗线），
                  且是纯绘制层、不参与布局——格子边框宽度恒为 1px，内容与邻格零位移。
                  勿改回「格子自身 border-2」（padding-box 收缩 1px，内容被挤，已否决）；
                  也勿用 inset-1 内嵌浮层（与原边框平行的第二条线，已否决）；勿用 ring（画在外沿，双线）。
                  触发：格内有任务选中，或（弹窗未开时）格子自身选中 */}
              {!deleteMode && ((!editingOpen && selectedDay === key) || hasSelectedTask) && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-10 rounded-xl border-2 border-status-today"
                />
              )}

              {/* 按日期删除的多选反馈：沿用“覆盖层只绘制、不改格子边框宽度”的日历几何约束。
                  红色只用于当前危险操作，和普通日期选中的亮蓝语义明确区分。 */}
              {deleteMode && selectedForDelete && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-20 rounded-xl border-2 border-status-overdue bg-status-overdue/[0.06]"
                >
                  <span className="absolute left-1 top-1 grid size-4 place-items-center rounded-full bg-status-overdue text-white shadow-sm">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                </span>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {/* 图例（未安排托盘已于 2026-10 下线：未安排任务以 chip 进停靠日格即可见，不再在网格下方平铺） */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-muted-foreground">
        <Legend color="bg-status-today" label={lang === "zh-CN" ? "今天" : "Today"} />
        <Legend color="bg-status-upcoming" label={lang === "zh-CN" ? "即将到来" : "Upcoming"} />
        <Legend color="bg-status-overdue" label={lang === "zh-CN" ? "逾期" : "Overdue"} />
        <Legend color="bg-status-done opacity-50" label={lang === "zh-CN" ? "已完成" : "Done"} />
      </div>
    </div>
  );
}

// 已完成任务的自绘删除线：CSS line-through 的纵向位置由字体度量决定（中文字形 11px
// 小字号下普遍偏上约 30% 高度），且无属性可调（text-underline-offset 只作用于下划线）；
// 改用伪元素锚定行盒几何中心（top-1/2 + 上移半像素），与字体解耦。1px、半透明灰；
// 两端缩进 6px（对齐 chip 的 px-1.5 文字边距），不贴边
const STRIKE_LINE =
  "relative after:pointer-events-none after:absolute after:left-1.5 after:right-1.5 after:top-1/2 after:h-px after:-translate-y-1/2 after:bg-muted-foreground/70 after:content-['']";

function statusChip(status: TaskView["status"]): string {
  switch (status) {
    case "today":
      return "bg-status-today/15 text-status-today";
    case "upcoming":
      return "bg-status-upcoming/15 text-foreground";
    case "overdue":
      return "bg-status-overdue/15 text-status-overdue";
    case "done":
      // 已完成：自绘删除线（见 STRIKE_LINE 注释）+ 淡绿底灰字
      return cn("bg-status-done/10 text-muted-foreground/70", STRIKE_LINE);
    default:
      return "bg-muted text-muted-foreground";
  }
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", color)} />
      {label}
    </span>
  );
}

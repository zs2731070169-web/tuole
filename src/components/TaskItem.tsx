// 任务项：HTML5 原生拖拽 + 行内操作按钮。红线——界面绝不出现「状态选择器」这类直接改状态的控件；
//          「完成 / 重新打开」是触发状态机流转的**动作**（只写 completedAt / scheduledDate），不是状态编辑。
//          「完成」受 canFinish 门禁：未安排/未来安排卡片不显示该按钮——先排期、日期到了才能结束。
// 交互约定：每张卡片行首有**常显勾选框**（批量选择的发现性入口，触屏同样可批量）；
//          点击一级任务本身只改选中态、不弹编辑抽屉，编辑走右侧「编辑」按钮；
//          未安排任务的排期走行内「安排」按钮（一键 scheduleTo 工作台选中日，落入「进行中」栏），
//          也可拖拽（拖入进行中栏/日历格）或编辑抽屉日期区间——行内不放日期选择弹层；
//          子任务的勾选在行内展开面板里完成，不进编辑抽屉；
//          操作区为 hover/focus 浮层，不挤压标题宽度——窄栏（工作台三栏）下标题优先完整显示。
// 光标红线：整卡（含全部子元素与子任务面板）一律手指——由根节点 task-item 类 +
//          styles.css 的 .task-item * { cursor: pointer !important } 强制实现，
//          组件内勿再散落 cursor-* 工具类（会被该规则压住且徒增混乱）。
import { forwardRef, useState } from "react";
import { GripVertical, CalendarClock, CalendarDays, CalendarCheck, CalendarPlus, ListTree, Pencil, ChevronDown, Check, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskView } from "../shared/types";
import { canFinish, STATUS_META, statusToneClass } from "../shared/statusMachine";
import { PriorityMark } from "./PriorityMark";
import { SchedulePopover } from "./SchedulePopover";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUiStore } from "../stores/useUiStore";
import { useConfirmStore } from "../stores/useConfirmStore";
import { useTaskStore } from "../stores/useTaskStore";
import { friendlyDate, todayKey, toDateKey } from "../lib/date";
import { t } from "../lib/i18n";

interface Props {
  task: TaskView;
  selected?: boolean;
  onOpen?: (id: string) => void;
  onToggleSelect?: (id: string, additive: boolean) => void;
}

export function TaskItem({ task, selected, onOpen, onToggleSelect }: Props) {
  const lang = useSettingsStore((s) => s.settings.language);
  const zh = lang === "zh-CN";
  const expanded = useUiStore((s) => s.expandedIds.includes(task.id));
  const toggleExpanded = useUiStore((s) => s.toggleExpanded);
  // 批量勾选态（与选中高亮分离）：只有勾选框本身/修饰键点击会打勾，单击卡片只高亮
  const checked = useUiStore((s) => s.checkedIds.includes(task.id));
  const toggleChecked = useUiStore((s) => s.toggleChecked);
  const scheduleTo = useTaskStore((s) => s.scheduleTo);
  const complete = useTaskStore((s) => s.complete);
  const deleteTasks = useTaskStore((s) => s.deleteTasks);
  const reopenByDate = useTaskStore((s) => s.reopenByDate);
  const rollOver = useTaskStore((s) => s.rollOver);
  const [dragging, setDragging] = useState(false);

  const isDone = task.status === "done";
  const subDone = task.subtasks.filter((s) => s.done).length;
  const hasSubs = task.subtasks.length > 0;
  const unscheduled = !task.scheduledDate && !isDone;

  return (
    <div className="task-item group/task relative min-w-0 w-full">
      <div
        data-task-card=""
        // Chromium 会让长期 draggable=true 的元素在普通鼠标移动中反复进入原生拖拽候选态，
        // 系统箭头因此可能短暂盖过 CSS pointer。静息时关闭，只在按下卡片正文后临时武装；
        // 拖拽仍可从整张卡正文发起，按钮/勾选框不会误触发拖拽。
        draggable={false}
        onPointerEnter={(e) => {
          if (e.buttons === 0) e.currentTarget.draggable = false;
        }}
        onPointerDown={(e) => {
          const target = e.target instanceof Element ? e.target : null;
          if (target?.closest("button, input, textarea, select, a, [role='button'], [role='checkbox']")) return;
          e.currentTarget.draggable = true;
        }}
        onPointerUp={(e) => {
          e.currentTarget.draggable = false;
        }}
        onPointerCancel={(e) => {
          e.currentTarget.draggable = false;
        }}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/task-id", task.id);
          e.dataTransfer.effectAllowed = "move";
          // 记录拖拽中任务的派生状态与 id：dragover 阶段读不到 dataTransfer——
          // 状态供已完成栏做拒绝反馈，id 供工作台栏内排序判「同栏放置」
          useUiStore.getState().setDraggingStatus(task.status);
          useUiStore.getState().setDraggingTaskId(task.id);
          setDragging(true);
        }}
        onDragEnd={(e) => {
          e.currentTarget.draggable = false;
          setDragging(false);
          useUiStore.getState().setDraggingStatus(null);
          useUiStore.getState().setDraggingTaskId(null);
        }}
        onClick={(e) => {
          // 普通点击只改选中态、不弹编辑抽屉（未安排任务的「安排」走行内按钮，不占单击）；
          // Cmd/Ctrl/Shift+点击 = 多选（供批量操作）
          if (e.metaKey || e.ctrlKey || e.shiftKey) onToggleSelect?.(task.id, true);
          else onToggleSelect?.(task.id, false);
        }}
        className={cn(
          // 只过渡颜色属性，勿改回 transition-all：Chromium 下全属性过渡进行中光标会瞬时
          // 回落默认箭头（鼠标在卡上移动时箭头/手指高频闪烁的根因），hover 本身只变边框色
          "group relative flex min-w-0 items-start gap-2.5 rounded-xl border px-3 py-3 transition-colors duration-200",
          "border-transparent bg-card",
          // 任务卡悬停只变边框，不绘制外部阴影，避免四角与外边缘产生灰色晕边。
          !selected && "hover:border-border/70",
          // 选中态只保留一层纯绘制描边：伪元素与卡片外缘完全重合，不改尺寸，也不会被滚动区裁剪。
          // 勿叠加实体蓝边 + inset ring；两套圆角曲率会在四角形成双线和毛边。
          selected &&
            "bg-status-today/[0.05] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border-2 after:border-status-today/55",
          dragging && "opacity-40",
          isDone && "opacity-60",
          expanded && "rounded-b-none",
        )}
      >
        {/* 状态色条：以视觉呈现状态，而非可操作控件 */}
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full",
            task.status === "today" && "bg-status-today",
            task.status === "overdue" && "bg-status-overdue",
            task.status === "upcoming" && "bg-status-upcoming",
            task.status === "unscheduled" && "bg-muted-foreground/30",
            task.status === "done" && "bg-status-done",
          )}
        />
        {/* 批量勾选框：常显（触屏也可批量操作），点击打勾进入批量集合——这是批量操作的发现性入口，
            修饰键 ⌘/Ctrl/Shift+点击是等价快捷路径。勾选态（checkedIds）与选中高亮（selectedIds）分离：
            单击卡片只高亮不打勾 */}
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={zh ? "勾选该任务（批量操作）" : "Check task (batch)"}
          title={zh ? "勾选以批量操作（删除等）；单击卡片只选中高亮，不会打勾" : "Check to batch-operate; clicking the card only highlights it"}
          onClick={(e) => {
            e.stopPropagation();
            toggleChecked(task.id);
          }}
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
            checked ? "border-status-today bg-status-today text-white" : "border-input hover:border-status-today/60",
          )}
        >
          {checked && <Check className="size-3.5" />}
        </button>
        <GripVertical className="mt-1 size-4 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100 max-[640px]:opacity-60" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                // min-w-0 + flex-1 是 truncate 生效的前提：否则 flex 子项 min-width:auto 不可收缩，
                // 标题会把优先级/状态 chip 顶出内容区。
                "min-w-0 flex-1 truncate text-[14px] font-medium leading-snug text-foreground",
              )}
            >
              {task.title || (zh ? "未命名任务" : "Untitled")}
            </p>
          </div>



          {/* 元信息行：每张卡必有时间锚点（2026-10 用户要求，任何状态都显示时间日期）——
              活动任务显示安排日（未安排显示停靠日，跟着日期走）；已结束任务显示完成日
             （工作台已完成栏/日历格均按完成日分桶，完成日才是它的时间归属） */}
          <>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              {isDone ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarCheck className="size-3" />
                  {zh ? "完成于 " : "Done "}
                  {friendlyDate(
                    task.completedAt
                      ? toDateKey(new Date(task.completedAt))
                      : (task.scheduledDate ?? task.parkedDate ?? todayKey()),
                    lang,
                  )}
                </span>
              ) : task.scheduledDate ? (
                <span className={cn("inline-flex items-center gap-1", task.status === "overdue" && "text-status-overdue font-medium")}>
                  <CalendarClock className="size-3" />
                  {friendlyDate(task.scheduledDate, lang)}
                  {task.dueDate && task.dueDate !== task.scheduledDate && (
                    <span className="tabular-nums"> → {friendlyDate(task.dueDate, lang)}</span>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  {t("board.unscheduled", lang)}
                  <span aria-hidden>·</span>
                  {friendlyDate(task.parkedDate ?? todayKey(), lang)}
                </span>
              )}
              {hasSubs && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <ListTree className="size-3" />
                  {subDone}/{task.subtasks.length}
                </span>
              )}
              {/* 优先级：与日期/子任务计数同在元信息行水平对齐（items-center），
                  直接作行内子项渲染，勿再包 mt-N 的块级壳（会下沉错位） */}
              {task.priority !== "none" && <PriorityMark priority={task.priority} lang={lang} />}
              {/* 状态 chip：置于优先级右侧、同一行水平对齐（产品要求，勿移回标题行）。
                  只标跨日期语义（逾期/已完成）——「未安排」由本行的日期位文字表达，不重复放 chip；
                  「今天/即将到来」不标（时间位置由所在栏/日期行表达）；左侧色条仍完整承载状态配色 */}
              {(task.status === "overdue" || isDone) && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
                    statusToneClass(task.status),
                  )}
                >
                  {zh ? STATUS_META[task.status].label : task.status}
                </span>
              )}
            </div>
          </>
        </div>

        {/* 行尾操作浮层：所有操作收进同一条 hover 工具栏，不再为常显「完成」按钮预留行宽。
            触屏（≤640px）整组转静态常显；完成按钮也复用同一条工具栏 */}
        <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 max-[640px]:static max-[640px]:translate-y-0 max-[640px]:self-center">
          {/* hover 工具条（触屏下常显）。勿加 backdrop-blur：模糊层悬在卡片右半侧上方，
              淡入淡出时合成层重建会加剧 Chromium 光标闪烁；底色用不透明 bg-card 视觉等价 */}
          <div className="flex items-center gap-1 rounded-lg bg-card opacity-0 shadow-sm ring-1 ring-border/60 transition-opacity duration-150 focus-within:opacity-100 group-hover/task:opacity-100 max-[640px]:rounded-none max-[640px]:bg-transparent max-[640px]:p-0 max-[640px]:opacity-100 max-[640px]:shadow-none max-[640px]:ring-0">
          {isDone ? (
            <RowButton
              label={zh ? "重新打开（排到今天）" : "Reopen (schedule for today)"}
              onClick={() => reopenByDate(task.id, todayKey())}
            >
              <RotateCcw className="size-4" />
              <span>{zh ? "重新打开" : "Reopen"}</span>
            </RowButton>
          ) : (
            <>
              {/* 完成是可结束任务的第一操作；未安排/未来安排/逾期任务不显示——
                  逾期卡以「改期跟进」为第一动作（四个改期入口在卡片下方常驻行，完成走编辑抽屉），
                  未安排/未来必须先排期 */}
              {canFinish(task.status) && task.status !== "overdue" && (
                <RowButton
                  label={zh ? "完成" : "Complete"}
                  className="text-status-done hover:border-status-done/30 hover:bg-status-done/15 hover:text-status-done"
                  onClick={() => complete([task.id], "manual")}
                >
                  <span>{zh ? "完成" : "Complete"}</span>
                </RowButton>
              )}
              {/* 未安排任务：「安排」按钮一键排到工作台选中日（自动落入「进行中」栏）；
                  不放日期选择弹层——改具体日期走拖拽（进行中栏/日历格）或编辑抽屉日期区间 */}
              {!task.scheduledDate && (
                <RowButton
                  label={zh ? "安排（排到选中日，进入进行中）" : "Schedule (to selected day, into In progress)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    scheduleTo(task.id, useUiStore.getState().workbenchDay);
                  }}
                >
                  <CalendarPlus className="size-4" />
                  <span>{zh ? "安排" : "Schedule"}</span>
                </RowButton>
              )}
              {/* 未来安排：一键「提到今天」——排到今天后完成入口随之出现（不破坏「未来不可直接结束」红线） */}
              {task.status === "upcoming" && (
                <RowButton
                  label={zh ? "提到今天（排到今天后即可完成）" : "Bring to today (then finishable)"}
                  onClick={() => scheduleTo(task.id, todayKey())}
                >
                  <CalendarCheck className="size-4" />
                  <span>{zh ? "提到今天" : "Today"}</span>
                </RowButton>
              )}
              {/* 已排期的活动任务：行内「顺延」（rollOver，一步到设置的目标日）。
                  纯文字无图标：与「完成」同宽（带图标会宽出 20px，工具条重心偏右）。
                  逾期任务不放这里——顺延移入卡片下方常驻的改期动作行 */}
              {task.scheduledDate && task.status !== "overdue" && (
                <RowButton
                  label={zh ? "顺延（按设置的目标日改期）" : "Roll over to the configured target day"}
                  onClick={() => rollOver([task.id])}
                >
                  <span>{zh ? "顺延" : "Later"}</span>
                </RowButton>
              )}
            </>
          )}
          {hasSubs && (
            // 不传 active：展开期间按钮保持常态外观（用户要求点击后自动恢复，勿持续高亮），
            // 展开/收起由箭头旋转（rotate-180）表达。
            // 勿用 iconOnly（size-8=32px 方形）：本按钮含两个图标共 34px，固定方形会挤压；
            // px-1.5 水平内边距让宽度自适应内容（约 46px），热区更宽
            <RowButton
              label={`${zh ? "子任务" : "Subtasks"} ${subDone}/${task.subtasks.length}`}
              className="px-1.5"
              onClick={() => toggleExpanded(task.id)}
            >
              <ListTree className="size-4" />
              <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
            </RowButton>
          )}
          <RowButton
            label={zh ? "编辑" : "Edit"}
            iconOnly
            onClick={() => onOpen?.(task.id)}
          >
            <Pencil className="size-4" />
          </RowButton>
        {/* 删除：所有任务可用（含已完成）；组件化确认弹窗（useConfirmStore.ask）后才执行——
              所有删除入口（行内/选中条批量）必须都带确认，勿绕过、勿用 window.confirm */}
          <RowButton
            label={t("action.delete", lang)}
            iconOnly
            onClick={async () => {
              const title = task.title || (zh ? "未命名任务" : "Untitled");
              const ok = await useConfirmStore.getState().ask(t("confirm.deleteTask", lang).replace("{title}", title));
              if (!ok) return;
              deleteTasks([task.id]);
              // 被删任务若在选中集里顺带移除，否则选中条计数会指向不存在的任务
              useUiStore.setState((s) => ({ selectedIds: s.selectedIds.filter((x) => x !== task.id) }));
            }}
          >
            <Trash2 className="size-4" />
          </RowButton>
          </div>
        </div>
      </div>

      {expanded && hasSubs && <SubtaskPanel task={task} />}

      {/* 逾期任务专属：卡片下方常驻一行改期动作（2026-10 用户要求——完成不再上工具条，
          改期跟进是逾期的第一动作，四个入口平铺常显、不依赖 hover，触屏同样可达；
          WorkbenchView 逾期面板不再叠加额外按钮行）：
          提到今天 = 排到今天（回「进行中」栏）；
          改期 = SchedulePopover 选任意日期（唯一带日期弹层的行内流转按钮）；
          顺延 = rollOver 到设置的目标日；取消安排 = 清除排期回「未安排」。
          （不放「安排」：排到选中日与提到今天语义重叠、任意日走改期，2026-10 用户判定冗余）
          显式结束走编辑抽屉「结束任务」 */}
      {task.status === "overdue" && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <RowButton
            label={zh ? "提到今天（排到今天后即可完成）" : "Bring to today (then finishable)"}
            onClick={() => scheduleTo(task.id, todayKey())}
          >
            <CalendarCheck className="size-4" />
            <span>{zh ? "提到今天" : "Today"}</span>
          </RowButton>
          {/* 行内改期只选新的起始日，scheduleTo 会平移整个执行期并保留跨度；
              修改起止日期走编辑抽屉的 DateRangeField。 */}
          <SchedulePopover
            lang={lang}
            selectedKey={task.scheduledDate ?? undefined}
            hint={t("action.rescheduleHint", lang)}
            onPick={(dayKey) => scheduleTo(task.id, dayKey)}
          >
            <RowButton label={t("action.rescheduleLabel", lang)}>
              <CalendarDays className="size-4" />
              <span>{t("action.reschedule", lang)}</span>
            </RowButton>
          </SchedulePopover>
          <RowButton
            label={zh ? "顺延（按设置的目标日改期）" : "Roll over to the configured target day"}
            onClick={() => rollOver([task.id])}
          >
            <span>{zh ? "顺延" : "Later"}</span>
          </RowButton>
          <RowButton
            label={zh ? "取消安排（清除排期，回到未安排）" : "Unschedule (clear the date)"}
            onClick={() => scheduleTo(task.id, null)}
          >
            <span>{t("action.unschedule", lang)}</span>
          </RowButton>
        </div>
      )}
    </div>
  );
}

// 子任务面板：勾选动作发生在这里（编辑抽屉内不再提供勾选）
function SubtaskPanel({ task }: { task: TaskView }) {
  const lang = useSettingsStore((s) => s.settings.language);
  const zh = lang === "zh-CN";
  const toggleSubtask = useTaskStore((s) => s.toggleSubtask);

  return (
    <ul
      className="space-y-0.5 rounded-b-xl border border-t-0 border-border/60 bg-muted/25 px-3 py-2"
      aria-label={zh ? "子任务清单" : "Subtasks"}
    >
      {task.subtasks.map((s) => (
        <li key={s.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/60">
          <button
            type="button"
            onClick={() => toggleSubtask(task.id, s.id)}
            aria-label={s.done ? (zh ? "标记未完成" : "Mark undone") : zh ? "标记完成" : "Mark done"}
            aria-pressed={s.done}
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
              s.done ? "border-status-done bg-status-done text-white" : "border-input hover:border-status-done/60",
            )}
          >
            {s.done && <span className="size-1.5 rounded-full bg-white" />}
          </button>
          <span className={cn("flex-1 truncate text-[13px]", s.done && "line-through opacity-55")}>{s.title}</span>
        </li>
      ))}
    </ul>
  );
}

// 行内操作按钮：h-8（32px）方形热区，图标 + 可选短计数；窄栏下靠 aria-label/title 表意。
// 不做持续高亮的 active 态——用户要求按钮点击后外观自动恢复常态（勿加回）。
// 契约：必须转发 ref 并透传其余 props——「安排到…」把本组件用作 Radix PopoverTrigger(asChild)
// 的子元素，若丢弃 ref，Popper 拿不到锚点几何，弹层会被定位到视口外（表现为点击无响应）。
const RowButton = forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode;
    label: string;
    iconOnly?: boolean;
    onClick?: (e: React.MouseEvent) => void;
  } & Omit<React.ComponentPropsWithoutRef<"button">, "children" | "onClick">
>(function RowButton({ children, label, iconOnly, onClick, ...rest }, forwardedRef) {
  const { className, ...buttonProps } = rest;

  return (
    <button
      ref={forwardedRef}
      type="button"
      onClick={(e) => {
        // 操作区按钮一律阻断冒泡：不触发外层任务行的「点选」
        e.stopPropagation();
        onClick?.(e);
      }}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-transparent",
        "text-[12px] font-medium text-muted-foreground transition-colors",
        "hover:border-border hover:bg-muted hover:text-foreground active:scale-95",
        iconOnly ? "size-8" : "px-2.5",
        className,
      )}
      {...buttonProps}
    >
      {children}
    </button>
  );
});

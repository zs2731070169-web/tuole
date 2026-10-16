// 任务项：HTML5 原生拖拽 + 行内操作按钮。红线——界面绝不出现「状态选择器」这类直接改状态的控件；
//          「完成 / 重新打开」是触发状态机流转的**动作**（完成只写 completedAt，不改 scheduledDates），不是状态编辑。
//          「完成」受 canFinish 门禁：未安排/未来安排卡片不显示该按钮——先排期、日期到了才能结束。
// 交互约定：每张卡片行首有**常显勾选框**（批量选择的发现性入口，触屏同样可批量）；
//          点击一级任务本身只改选中态、不弹编辑抽屉，编辑走右侧「编辑」按钮；
//          未安排任务的排期走行内「安排」按钮（一键 scheduleTo 工作台选中日，落入「进行中」栏），
//          也可拖拽（拖入进行中栏/日历格）或编辑抽屉日期区间——行内不放日期选择弹层；
//          待办项（2026-10 由「子任务」更名）的勾选在行内展开面板里完成，不进编辑抽屉；
//          操作区在卡片下方独立成行，hover/卡内聚焦时浮出（2026-10-09 用户决策：浮层压在
//          卡内会盖住标题/标签，挤压让位又把内容挤爆——整行挪出卡片，标题永远全宽）。
// 光标红线：整卡（含全部子元素与待办项面板）一律手指——由根节点 task-item 类 +
//          styles.css 的 .task-item * { cursor: pointer !important } 强制实现，
//          组件内勿再散落 cursor-* 工具类（会被该规则压住且徒增混乱）。
import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { GripVertical, CalendarClock, CalendarDays, CalendarCheck, CalendarPlus, ListTree, Pencil, ChevronDown, Check, RotateCcw, Trash2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskView } from "../shared/types";
import { canFinish, STATUS_META, statusToneClass } from "../shared/statusMachine";
import { computeTaskElapsed, formatTaskElapsed } from "../shared/taskElapsed";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { PriorityMark } from "./PriorityMark";
import { SchedulePopover } from "./SchedulePopover";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUiStore } from "../stores/useUiStore";
import { useConfirmStore } from "../stores/useConfirmStore";
import { useTaskStore } from "../stores/useTaskStore";
import { absoluteDateLabel, toDateKey, workbenchDateLabel, todayKey } from "../lib/date";
import { firstScheduledDay, isContiguousDays, lastScheduledDay } from "../shared/taskDates";
import { todosForDisplay } from "../shared/todos";
import { groupToneClass } from "../shared/groups";
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
  const startTask = useTaskStore((s) => s.startTask);
  const complete = useTaskStore((s) => s.complete);
  const deleteTasks = useTaskStore((s) => s.deleteTasks);
  const reopen = useTaskStore((s) => s.reopen);
  const rollOver = useTaskStore((s) => s.rollOver);
  const [dragging, setDragging] = useState(false);

  const isDone = task.status === "done";
  // 已完成任务的待办项一律按已勾选口径计数（n/m 恒满格，2026-10-17 用户决策）；
  // 展示派生不回写存储，重新打开任务即回到真实勾选进度
  const todoDone = todosForDisplay(task.todos, isDone).filter((s) => s.done).length;
  const hasTodos = task.todos.length > 0;
  // 执行花费时间（纯派生，随渲染时计算、无实时跳秒）：done → 耗时；today/overdue → 已进行；
  // 未安排/未来安排无值不渲染。日历格 chip 不展示（92px 格高预算红线）
  const elapsed = computeTaskElapsed(task, new Date().toISOString());
  const elapsedText = elapsed ? formatTaskElapsed(elapsed, lang) : null;
  const completedDay = task.completedAt && !Number.isNaN(Date.parse(task.completedAt))
    ? toDateKey(new Date(task.completedAt))
    : null;

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
                // 标题在窄卡片内保持单行截断，不撑宽内容区。
                "min-w-0 flex-1 truncate text-[14px] font-medium leading-snug text-foreground",
              )}
            >
              {task.title || (zh ? "未命名任务" : "Untitled")}
            </p>
          </div>
          {/* 时间元信息行：只放日期 / 待办项 / 耗时。
              状态、优先级、分组、标签拆到下方独立分类行，不再由宽度不足时的被动换行决定位置。 */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              {task.status !== "unscheduled" && task.scheduledDates.length > 0 ? (
                <span className={cn("inline-flex items-center gap-1", task.status === "overdue" && "text-status-overdue font-medium")}>
                  {isDone ? <CalendarCheck className="size-3" /> : <CalendarClock className="size-3" />}
                  {isDone && <span>{t("task.scheduledAt", lang).replace(" {date}", "")}</span>}
                  {/* 连续执行期 = 首日 → 末日；分散（拖拽逐日移动产生）= 首日 + 「等 N 天」 */}
                  {isDone
                    ? absoluteDateLabel(firstScheduledDay(task)!, lang)
                    : workbenchDateLabel(firstScheduledDay(task)!, lang)}
                  {isContiguousDays(task)
                    ? (lastScheduledDay(task)! !== firstScheduledDay(task)! && (
                        <span className="tabular-nums"> → {isDone
                          ? absoluteDateLabel(lastScheduledDay(task)!, lang)
                          : workbenchDateLabel(lastScheduledDay(task)!, lang)}</span>
                      ))
                    : (task.scheduledDates.length > 1 && (
                        <span className="tabular-nums"> {zh ? `等 ${task.scheduledDates.length} 天` : `· ${task.scheduledDates.length} days`}</span>
                      ))}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  {t("board.unscheduled", lang)}
                  <span aria-hidden>·</span>
                  {workbenchDateLabel(firstScheduledDay(task) ?? task.parkedDate ?? todayKey(), lang)}
                </span>
              )}
              {/* 完成日只是生命周期记录，不改变任务所属日。已完成卡同时展示
                  「安排于… · 完成于…」，明示逾期后完成而不把任务换日。 */}
              {isDone && completedDay && (
                <span className="inline-flex items-center gap-1 tabular-nums before:content-['·']">
                  {t("task.completedAt", lang).replace("{date}", absoluteDateLabel(completedDay, lang))}
                </span>
              )}
              {hasTodos && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <ListTree className="size-3" />
                  {todoDone}/{task.todos.length}
                </span>
              )}
              {/* 执行花费时间：日期锚点/待办项计数之后的同款元信息项；逾期红字只染日期锚点 span，
                  耗时保持 muted（状态语义不重复上色） */}
              {elapsedText && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Timer className="size-3" />
                  {elapsedText}
                </span>
              )}
          </div>

          {/* 分类行（2026-10-11 用户截图定调）：固定按「状态 → 优先级 → 分组 → 标签」排列。
              所有派生状态都渲染 chip，不再只标逾期/已完成；该行即使只有状态也稳定存在。 */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
                statusToneClass(task.status),
              )}
            >
              {zh ? STATUS_META[task.status].label : task.status}
            </span>

            {task.priority !== "none" && <PriorityMark priority={task.priority} lang={lang} />}

            {/* 分组：确定性色档与日历内同组任务同色；无分组不渲染 */}
            {task.group && (
              <span
                className={cn(
                  "max-w-24 shrink-0 truncate rounded-full px-1.5 py-0.5 text-[11px] leading-none",
                  groupToneClass(task.group),
                )}
              >
                {task.group}
              </span>
            )}

            {/* 标签：纯展示性元数据，保持中性 muted，不与分组色语义混用 */}
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="max-w-24 shrink-0 truncate rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

      </div>

      {expanded && hasTodos && <TodoPanel task={task} />}

      {/* 行内操作行（2026-10-09 用户决策：整排挪出卡片）：悬停在卡内的浮层要么盖住标题/标签、
          要么挤压内容（「让位 padding」方案实测把内容挤到逐字竖排撑爆卡片，已废弃，勿回）。
          现独立成行挂在卡片下方、右对齐——与逾期改期行同款模式，标题永远全宽、标签永不被压，
          点卡片正文也碰不到按钮。静息 display:none 完全不占高（卡片间距恒定）；悬停整卡或
          卡内聚焦（Tab 到勾选框即浮出，按钮随后可达）时显示；触屏无 hover 常显 */}
      <div className="mt-1 hidden flex-wrap items-center justify-end gap-1 group-hover/task:flex group-focus-within/task:flex max-[640px]:flex">
        {isDone ? (
          <RowButton
            label={zh ? "重新打开（保留原安排日期）" : "Reopen (keep scheduled dates)"}
            onClick={() => reopen(task.id)}
          >
            <RotateCcw className="size-4" />
            <span>{zh ? "重新打开" : "Reopen"}</span>
          </RowButton>
        ) : (
          <>
            {/* 完成是可结束任务的第一操作；未安排/未来安排不显示——必须先排期。
                逾期任务也可结束，但它的操作一律放在下方常驻行，避免这里再出现一个重复的「完成」。 */}
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
            {task.status === "unscheduled" && (
              <RowButton
                label={zh ? "安排（排到选中日，进入进行中）" : "Schedule (to selected day, into In progress)"}
                onClick={(e) => {
                  e.stopPropagation();
                  startTask(task.id);
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
            {task.status !== "unscheduled" && task.scheduledDates.length > 0 && task.status !== "overdue" && (
              <RowButton
                label={zh ? "顺延（按设置的目标日改期）" : "Roll over to the configured target day"}
                onClick={() => rollOver([task.id])}
              >
                <span>{zh ? "顺延" : "Later"}</span>
              </RowButton>
            )}
          </>
        )}
        {hasTodos && (
          // 不传 active：展开期间按钮保持常态外观（用户要求点击后自动恢复，勿持续高亮），
          // 展开/收起由箭头旋转（rotate-180）表达。
          // 勿用 iconOnly（size-8=32px 方形）：本按钮含两个图标共 34px，固定方形会挤压；
          // px-1.5 水平内边距让宽度自适应内容（约 46px），热区更宽
          <RowButton
            label={`${t("field.todos", lang)} ${todoDone}/${task.todos.length}`}
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

      {/* 逾期任务专属：卡片下方常驻一行结束/跟进动作（2026-10-12 用户决策）。
          最终动作集 = 完成 / 提到今天 / 改期 / 取消安排；「顺延」与前两种改期路径重叠，从逾期卡移除。
          常驻行不依赖 hover，触屏同样可达；WorkbenchView 逾期面板不再叠加额外按钮行：
          完成 = 只写 completedAt，保留原 scheduledDates，任务因此进原所属日的已完成栏；
          提到今天 = 排到今天（回「进行中」栏）；
          改期 = SchedulePopover 选任意日期（唯一带日期弹层的行内流转按钮）；
          取消安排 = 清除排期回「未安排」。 */}
      {task.status === "overdue" && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <RowButton
            label={zh ? "完成" : "Complete"}
            className="text-status-done hover:border-status-done/30 hover:bg-status-done/15 hover:text-status-done"
            onClick={() => complete([task.id], "manual")}
          >
            <span>{zh ? "完成" : "Complete"}</span>
          </RowButton>
          <RowButton
            label={zh ? "提到今天（排到今天后即可完成）" : "Bring to today (then finishable)"}
            onClick={() => scheduleTo(task.id, todayKey())}
          >
            <CalendarCheck className="size-4" />
            <span>{zh ? "提到今天" : "Today"}</span>
          </RowButton>
          {/* 行内改期只选新的起始日，scheduleTo 会整体平移全部执行日期；
              修改起止日期走编辑抽屉的 DateRangeField。 */}
          <SchedulePopover
            lang={lang}
            selectedKey={firstScheduledDay(task) ?? undefined}
            hint={t("action.rescheduleHint", lang)}
            onPick={(dayKey) => scheduleTo(task.id, dayKey)}
          >
            <RowButton label={t("action.rescheduleLabel", lang)}>
              <CalendarDays className="size-4" />
              <span>{t("action.reschedule", lang)}</span>
            </RowButton>
          </SchedulePopover>
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

// 待办项面板（2026-10 由「子任务」更名，内部组件名沿用历史契约）：勾选动作发生在这里（编辑抽屉内不再提供勾选）。
// 已完成任务的待办项按派生视图渲染（一律已勾选，2026-10-17）且勾选锁定——store toggleTodo 同口径防御
function TodoPanel({ task }: { task: TaskView }) {
  const lang = useSettingsStore((s) => s.settings.language);
  const zh = lang === "zh-CN";
  const toggleTodo = useTaskStore((s) => s.toggleTodo);
  const locked = task.status === "done";
  const rows = todosForDisplay(task.todos, locked);

  return (
    // 悬停 0.5s 弹完整内容气泡：skipDelayDuration=0 保证每一项都完整等 0.5s（连扫列表不连环弹）；
    // disableHoverableContent 与节奏图同款——密集行场景旧气泡的 grace 区会粘连相邻行
    <TooltipProvider delayDuration={500} skipDelayDuration={0} disableHoverableContent>
      <ul
        className="space-y-0.5 rounded-b-xl border border-t-0 border-border/60 bg-muted/25 px-3 py-2"
        aria-label={t("todos.listAria", lang)}
      >
        {rows.map((s) => (
          <TodoRow key={s.id} task={task} todo={s} zh={zh} onToggle={toggleTodo} locked={locked} />
        ))}
      </ul>
    </TooltipProvider>
  );
}

// 待办项行：触发热区 = 整行 li（勾选框、留白、文字都算——不要求悬停精准落在文字上，
// 2026-10-09 用户要求）；仅标题真正截断的行挂气泡（短标题弹同文气泡纯属噪音，与节奏图
// 「n>0 才挂气泡」同口径）；组件 Tooltip 而非原生 title——系统气泡延迟约 1s 且样式不可控
function TodoRow({
  task,
  todo,
  zh,
  onToggle,
  locked,
}: {
  task: TaskView;
  todo: TaskView["todos"][number];
  zh: boolean;
  onToggle: (taskId: string, todoId: string) => void;
  // 已完成任务的勾选锁定：todo 已是派生视图（恒已勾选），允许点击会写脏真实进度且视觉无反馈
  locked: boolean;
}) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [truncated, setTruncated] = useState(false);

  // 挂载时测一次溢出：面板随展开重新挂载，测量时机足够
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth);
  }, [todo.title]);

  const row = (
    <li className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/60">
      <button
        type="button"
        disabled={locked}
        onClick={() => onToggle(task.id, todo.id)}
        aria-label={todo.done ? (zh ? "标记未完成" : "Mark undone") : zh ? "标记完成" : "Mark done"}
        aria-pressed={todo.done}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
          todo.done ? "border-status-done bg-status-done text-white" : "border-input hover:border-status-done/60",
        )}
      >
        {todo.done && <span className="size-1.5 rounded-full bg-white" />}
      </button>
      <span ref={textRef} className={cn("flex-1 truncate text-[13px]", todo.done && "line-through opacity-55")}>
        {todo.title}
      </span>
    </li>
  );

  if (!truncated) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 whitespace-normal break-words">
        {todo.title}
      </TooltipContent>
    </Tooltip>
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

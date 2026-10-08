// 任务详情/编辑抽屉：标题、说明、优先级、执行期（起止日期）、子任务。
// **全缓冲编辑（2026-10 用户决策）**：所有字段只在本地暂存，「保存」才一次性原子落库——
// 编辑过程中任务状态/所在栏零变化（status chip 也因此恒定）；X/遮罩/Esc 关闭 = 放弃全部
// 未保存修改（含已有任务）。红线：无「修改状态」控件；顺延/结束/删除不入抽屉——结束走
// 任务行「完成」按钮或拖入已完成栏，删除走行内按钮/选中条，顺延走行内按钮。底部只有「保存并关闭」一个动作。
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Priority, Subtask, TaskView } from "../../shared/types";
import { PRIORITY_OPTIONS } from "../../shared/constants";
import { useTaskStore } from "../../stores/useTaskStore";
import { useUiStore } from "../../stores/useUiStore";
import { t } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { DateRangeField } from "../../components/DateRangeField";
import { STATUS_META, statusToneClass } from "../../shared/statusMachine";
import { todayKey } from "../../lib/date";

// 缓冲区新子任务的临时 id（提交时随 subtasks 数组整段落库，id 只需本地唯一）
function generateDraftSubtaskId(): string {
  return `sub-draft-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

export function TaskEditor({ task }: { task: TaskView }) {
  const lang = useSettingsStore((s) => s.settings.language);
  const updateTask = useTaskStore((s) => s.updateTask);
  const closeEditor = useUiStore((s) => s.closeEditor);
  // —— 缓冲区：打开（或切换编辑对象）时从任务快照初始化，交互期间不回读 store ——
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [scheduledDate, setScheduledDate] = useState<string | null>(task.scheduledDate);
  const [dueDate, setDueDate] = useState<string | null>(task.dueDate);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks);
  const [subDraft, setSubDraft] = useState("");
  // 标题必填校验（2026-10 用户决策）：为空点保存 → 不落库不关抽屉，行内红字提示 + 聚焦输入框
  const [titleError, setTitleError] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTitle(task.title);
    setNote(task.note);
    setPriority(task.priority);
    setScheduledDate(task.scheduledDate);
    setDueDate(task.dueDate);
    setSubtasks(task.subtasks);
    setTitleError(false);
  }, [task.id]);

  // 保存 = 唯一提交点：全部字段连同执行期一次 updateTask 原子落库。
  // 标题必填：为空时阻断保存并给出行内提示（标题是任务的最小身份）
  const commitAndClose = () => {
    if (title.trim() === "") {
      setTitleError(true);
      titleInputRef.current?.focus();
      return;
    }
    const nextEnd = scheduledDate && dueDate && dueDate > scheduledDate ? dueDate : null;
    const originalEnd = task.scheduledDate && task.dueDate && task.dueDate > task.scheduledDate ? task.dueDate : null;
    const dateChanged = scheduledDate !== task.scheduledDate || nextEnd !== originalEnd;
    updateTask(task.id, {
      title,
      note,
      priority,
      scheduledDate,
      dueDate: nextEnd,
      parkedDate: scheduledDate ? null : (task.scheduledDate ? todayKey() : task.parkedDate ?? todayKey()),
      ...(dateChanged ? { completedAt: null, completedReason: null } : {}),
      subtasks,
      ...(task.draft === true ? { draft: false } : {}),
    });
    // 新建草稿保存后的「不再凭空消失」反馈：工作台新建、执行起始日又不是当前选中日时，
    // 任务保存后不在当前视图——不自动切锚点（锚点会跟着建任务来回跳，用户否决），改为弹出
    // 第一方「跳转横幅」（CreationJumpBanner）告知去处 +「查看」一键跳转。仅限新建草稿：
    // 编辑已有任务改期意图是改任务而非看结果，不打扰
    if (task.draft === true) {
      const { view, workbenchDay, showCreationNotice } = useUiStore.getState();
      if (view === "workbench" && scheduledDate && scheduledDate !== workbenchDay) {
        showCreationNotice(scheduledDate);
      }
    }
    closeEditor();
  };

  return (
    // role="dialog" 让编辑抽屉进入各处「操作浮层」豁免清单（[role='dialog'] closest 判定）：
    // 逾期面板的「点外部/Escape 收起」不把抽屉遮罩当外部、工作台点空白清高亮不吞抽屉内点击
    //（2026-10 用户决策：对逾期任务的操作退出后，逾期面板不得被顺带自动关闭）
    <div role="dialog" className="fixed inset-0 z-50 flex justify-end">
      {/* 遮层可点击关闭：cursor-pointer 让被遮住的日历格/任务行区域保持手型，不回落为箭头。
          走 closeEditor（放弃全部未保存修改）而非 commitAndClose——标题必填门禁生效后，
          空标题点遮罩应是「关闭放弃」而不是被门禁拦住关不掉 */}
      <div className="absolute inset-0 cursor-pointer bg-black/30" onClick={closeEditor} />
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
          <span className="ml-auto text-[11px] text-muted-foreground">
            {lang === "zh-CN" ? "状态由系统自动维护" : "Status is automatic"}
          </span>
          <button onClick={closeEditor} className="grid size-8 place-items-center rounded-lg hover:bg-muted">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
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

          <Field label={t("field.note", lang)}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-[13px] outline-none focus:border-ring"
            />
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

          <Field label={t("field.taskPeriod", lang)}>
            <DateRangeField
              lang={lang}
              start={scheduledDate}
              end={dueDate}
              onChange={({ start, end }) => {
                setScheduledDate(start);
                setDueDate(end);
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("editor.taskPeriodHint", lang)}
            </p>
          </Field>

          {/* 「重复」字段已整体移除（2026-10 用户决策：周期任务引擎未实现，有控件无效果最误导；
              数据契约同步删除，历史数据由 loadTasks 剥离，勿加回） */}

          {/* 子任务（一层嵌套）：这里只能新增/改名/删除，勾选在任务行的子任务面板里完成。
              全缓冲——增改删都只动本地数组，保存时随整段 subtasks 落库 */}
          <Field label={lang === "zh-CN" ? "子任务" : "Subtasks"}>
            <div className="space-y-1.5">
              {subtasks.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      s.done ? "bg-status-done" : "bg-muted-foreground/40",
                    )}
                    aria-hidden
                  />
                  <input
                    value={s.title}
                    onChange={(e) =>
                      setSubtasks((cur) =>
                        cur.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)),
                      )
                    }
                    className="min-w-0 flex-1 truncate bg-transparent text-[13px] outline-none"
                    aria-label={lang === "zh-CN" ? "子任务名称" : "Subtask title"}
                  />
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {s.done ? (lang === "zh-CN" ? "已完成" : "Done") : ""}
                  </span>
                  <button
                    onClick={() => setSubtasks((cur) => cur.filter((x) => x.id !== s.id))}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <input
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && subDraft.trim()) {
                      setSubtasks((cur) => [
                        ...cur,
                        { id: generateDraftSubtaskId(), title: subDraft.trim(), done: false },
                      ]);
                      setSubDraft("");
                    }
                  }}
                  placeholder={lang === "zh-CN" ? "添加子任务，回车确认" : "Add subtask, Enter to confirm"}
                  className="h-8 flex-1 rounded-lg border border-input bg-background px-2.5 text-[13px] outline-none focus:border-ring"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {lang === "zh-CN"
                  ? "勾选完成请在任务列表展开该任务的子任务面板进行，此处仅管理内容。"
                  : "Tick subtasks from the task row's subtask panel; here you only manage their content."}
              </p>
            </div>
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

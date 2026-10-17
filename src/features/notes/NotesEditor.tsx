// 备忘侧边栏（2026-10-18）：TaskEditor 同款全缓冲抽屉，但**无草稿机制**——
// create 模式点「保存」才创建实体（备忘创建零副作用，勿引入任务的 draft 机制）；
// edit 模式缓冲从备忘快照初始化、保存一次 updateNote 原子落库。
// convert 模式同样零副作用打开：标题/备注取自备忘，日期不预填；只有用户显式选定单日并
// 点「转为任务」才创建任务、移除备忘，× 关闭则完整保留备忘。
// × 关闭 = 放弃全部未保存修改（唯一关闭入口，遮罩不响应点击——与任务编辑抽屉同口径）。
// create/edit 字段仍仅 标题（必填）+ 备注；日期只属于 convert 缓冲，不写回 NoteItem。
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useUiStore } from "../../stores/useUiStore";
import { useNoteStore } from "../../stores/useNoteStore";
import { SingleDateField } from "../../components/SingleDateField";
import { friendlyDate } from "../../lib/date";
import { t } from "../../lib/i18n";

export function NotesEditor() {
  const lang = useSettingsStore((s) => s.settings.language);
  const noteEditor = useUiStore((s) => s.noteEditor);
  const closeNoteEditor = useUiStore((s) => s.closeNoteEditor);
  // edit / convert 模式按 id 定位源备忘（create 模式无持久化实体）
  const editingNote = useNoteStore((s) =>
    noteEditor && noteEditor.mode !== "create" ? s.notes.find((n) => n.id === noteEditor.id) : undefined,
  );
  const createNote = useNoteStore((s) => s.createNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const convertNoteToTask = useNoteStore((s) => s.convertNoteToTask);

  const [title, setTitle] = useState(() => editingNote?.title ?? "");
  const [note, setNote] = useState(() => editingNote?.note ?? "");
  // 转任务日期刻意不预填：打开侧边栏不会默认为今天，必须由用户主动选定单日。
  const [scheduledDay, setScheduledDay] = useState<string | null>(null);
  // 标题必填校验（与 TaskEditor 同口径）：为空点保存 → 不落库不关抽屉，行内红字 + 聚焦
  const [titleError, setTitleError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  // 缓冲区随模式/目标切换重初始化；同一条备忘从 edit 切到 convert 也必须清空转换日期。
  const editorKey = noteEditor
    ? noteEditor.mode === "create"
      ? "create"
      : `${noteEditor.mode}:${noteEditor.id}`
    : "closed";
  useEffect(() => {
    setTitle(editingNote?.title ?? "");
    setNote(editingNote?.note ?? "");
    setScheduledDay(null);
    setTitleError(false);
    setDateError(false);
  }, [editorKey]);

  // 编辑对象消失（如已被其他路径转任务/删除）→ 收起抽屉，防「幽灵编辑」
  useEffect(() => {
    if (noteEditor && noteEditor.mode !== "create" && !editingNote) closeNoteEditor();
  }, [noteEditor, editingNote, closeNoteEditor]);

  // 备注框随内容自动长高（TaskEditor 同款工艺）：先 auto 归零再量 scrollHeight，删行才回缩；
  // **不封顶**——超出抽屉视野由本体滚动承接。高度须**加回上下边框厚度**（border-box 下
  // scrollHeight 不含边框，少 2px 会让内容永久溢出、textarea 常驻细滑条）；overflow-hidden 双保险
  useEffect(() => {
    const el = noteInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const computedStyle = getComputedStyle(el);
    const borderThickness =
      parseFloat(computedStyle.borderTopWidth) + parseFloat(computedStyle.borderBottomWidth);
    el.style.height = `${el.scrollHeight + (Number.isNaN(borderThickness) ? 0 : borderThickness)}px`;
  }, [note]);

  // 保存/转正 = 唯一提交点：convert 还要求显式单日；校验通过前两个 store 均零改动。
  const commitAndClose = () => {
    if (!noteEditor) return;
    if (title.trim() === "") {
      setTitleError(true);
      titleInputRef.current?.focus();
      return;
    }
    if (noteEditor.mode === "convert") {
      if (!scheduledDay) {
        setDateError(true);
        return;
      }
      const task = convertNoteToTask(noteEditor.id, { title, note, scheduledDay });
      if (!task) return;
      toast.success(
        t("notes.convertedToast", lang).replace("{date}", friendlyDate(scheduledDay, lang)),
      );
    } else if (noteEditor.mode === "edit") {
      updateNote(noteEditor.id, { title, note });
    } else {
      createNote({ title, note });
    }
    closeNoteEditor();
  };

  if (!noteEditor) return null;

  return (
    // 骨架与 TaskEditor 完全同款：role="dialog" 进「操作浮层」豁免清单；不覆盖顶栏（69px = 顶栏
    // 实测高度），桌面端拖拽带保持可用；遮罩纯视觉不响应点击，关闭唯一入口 = 右上角 ×
    <div role="dialog" className="fixed bottom-0 left-0 right-0 top-[69px] z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        {/* 头部：抽屉标题（任务编辑抽屉此处是 status chip，备忘无状态概念）+ 关闭 × */}
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <span className="text-[14px] font-semibold">
            {t(
              noteEditor.mode === "convert"
                ? "notes.editorConvertTitle"
                : noteEditor.mode === "edit"
                  ? "notes.editorEditTitle"
                  : "notes.editorNewTitle",
              lang,
            )}
          </span>
          <button
            onClick={closeNoteEditor}
            aria-label={lang === "zh-CN" ? "关闭" : "Close"}
            className="ml-auto grid size-8 place-items-center rounded-lg hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </header>

        {/* 滚动区挂 scrollbar-none（完全无滑条，与任务编辑抽屉同口径） */}
        <div className="scrollbar-none flex-1 space-y-4 overflow-y-auto p-4">
          {noteEditor.mode === "convert" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
              {t("notes.convertIntro", lang)}
            </p>
          )}

          <Field label={t("field.title", lang)} required>
            <input
              ref={titleInputRef}
              value={title}
              aria-invalid={titleError}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false); // 重新输入即撤下错误提示
              }}
              className={cn(
                "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[14px] font-medium outline-none focus:border-ring",
                titleError && "border-destructive focus:border-destructive",
              )}
            />
            {titleError && (
              <p role="alert" className="mt-1 text-[11px] font-medium text-destructive">
                {t("editor.titleRequired", lang)}
              </p>
            )}
          </Field>

          {noteEditor.mode === "convert" && (
            <Field label={t("notes.convertDate", lang)} required>
              <SingleDateField
                lang={lang}
                value={scheduledDay}
                allowClear={false}
                placeholder={t("notes.convertDatePlaceholder", lang)}
                onChange={(day) => {
                  setScheduledDay(day);
                  if (day) setDateError(false);
                }}
              />
              {dateError && (
                <p role="alert" className="mt-1 text-[11px] font-medium text-destructive">
                  {t("notes.convertDateRequired", lang)}
                </p>
              )}
            </Field>
          )}

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

        {/* 底部确认条：create/edit 保存备忘；convert 到这里才真正创建任务并移除备忘 */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={commitAndClose}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
          >
            {t(noteEditor.mode === "convert" ? "notes.convertConfirm" : "action.save", lang)}
          </button>
        </footer>
      </aside>
    </div>
  );
}

// 与 TaskEditor 的 Field 同款局部组件（15 行，不值得跨域抽共享）
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

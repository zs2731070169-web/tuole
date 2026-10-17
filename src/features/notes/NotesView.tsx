// 备忘视图（2026-10-18 第 4 视图）：「未来某一天可能会安排、现在还不确定」的任务暂存池。
// 独立实体（useNoteStore），不消费任务的 filtered/筛选体系；生效的查看条件 = 全局搜索关键词
// （filterNotes 按 title/note contains，镜像任务搜索口径）+ 记于单日锚点（uiStore.notesDay，
// filterNotesByCreatedRange 同日闭区间；null = 全部日期）。日期选择 = 行首单日选择器
// （NotesDayPicker，2026-10-18 用户决策：左上角 + 单日，**勿用范围日期胶囊**——
// DateRangeInlineFilter 不进备忘视图）。
// 交互红线：备忘不可拖拽、无勾选框/选中态（不挂 task-item 类）、不进 selectedIds/checkedIds；
// 操作行在卡片下方独立成行（TaskItem 同款 idiom：hover/聚焦浮出、触屏常显）。
import { useMemo } from "react";
import { CalendarDays, ChevronDown, Inbox, ListTodo, Pencil, Trash2 } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useFilterStore } from "../../stores/useFilterStore";
import { useUiStore } from "../../stores/useUiStore";
import { useNoteStore } from "../../stores/useNoteStore";
import { useConfirmStore } from "../../stores/useConfirmStore";
import { filterNotes, filterNotesByCreatedRange } from "../../shared/notes";
import { absoluteDateLabel, toDateKey } from "../../lib/date";
import { t } from "../../lib/i18n";
import { RowButton } from "../../components/RowButton";
import { SchedulePopover } from "../../components/SchedulePopover";
import type { NoteItem } from "../../shared/types";

// 备忘选日控件（渲染在 ViewToolbar 行首 leading 槽，与 WorkbenchDayPicker 同范式）：
// 单日查看「记于该日」的备忘；「全部日期」快捷项清除锚点回全量（默认态）。
// 高度对齐 h-9 / 13px 文字，与工具行右侧的新建/搜索同一视觉量级
export function NotesDayPicker() {
  const lang = useSettingsStore((s) => s.settings.language);
  const notesDay = useUiStore((s) => s.notesDay);
  const setNotesDay = useUiStore((s) => s.setNotesDay);

  return (
    <SchedulePopover
      lang={lang}
      onPick={setNotesDay}
      selectedKey={notesDay ?? undefined}
      onClear={() => setNotesDay(null)}
      clearLabel={t("notes.allDates", lang)}
      hint={t("notes.dayPickerHint", lang)}
    >
      <button className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted active:scale-95">
        <CalendarDays className="size-4 text-muted-foreground" />
        {notesDay ? absoluteDateLabel(notesDay, lang) : t("notes.allDates", lang)}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
    </SchedulePopover>
  );
}

export function NotesView() {
  const lang = useSettingsStore((s) => s.settings.language);
  const notes = useNoteStore((s) => s.notes);
  const keyword = useFilterStore((s) => s.filter.keyword);
  const notesDay = useUiStore((s) => s.notesDay);
  const openNoteEditor = useUiStore((s) => s.openNoteEditor);
  const deleteNote = useNoteStore((s) => s.deleteNote);

  // 派生计算在 useMemo（勿在 selector 里调方法返回新数组——无限重渲染红线）；
  // 单日锚点 = 记于日闭区间（from = to = 该日）；排序 = createdAt 降序（最新在前，无拖拽重排）
  const visibleNotes = useMemo(() => {
    const filtered = filterNotesByCreatedRange(filterNotes(notes, keyword), notesDay, notesDay);
    return [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [notes, keyword, notesDay]);

  // 转为任务先打开全缓冲侧边栏：此刻不建任务、不删备忘；用户显式选定单日并确认后才转正。
  // 右上角 × 关闭即取消，原备忘完整保留；确认后仍留在备忘视图，不自动导航工作台。
  const handleConvert = (noteItem: NoteItem) => {
    openNoteEditor({ mode: "convert", id: noteItem.id });
  };

  // 删除一律走应用内确认弹窗（危险红口径，与任务删除同构；备忘不进 selectedIds，无需清理）
  const handleDelete = async (noteItem: NoteItem) => {
    const ok = await useConfirmStore
      .getState()
      .ask(t("notes.deleteConfirm", lang).replace("{title}", noteItem.title));
    if (ok) deleteNote(noteItem.id);
  };

  // 空态分两种：池子本身为空 vs 搜索/选日无匹配（复用工作台的 noMatch 文案）
  if (visibleNotes.length === 0) {
    const hasViewCondition = keyword.trim() !== "" || notesDay !== null;
    const emptyText = notes.length > 0 && hasViewCondition ? t("board.noMatch", lang) : t("notes.empty", lang);
    return <EmptyLine text={emptyText} />;
  }

  return (
    <div className="space-y-1.5">
      {visibleNotes.map((noteItem) => (
        <div key={noteItem.id} className="group/note relative w-full">
          {/* 卡片本体：无手指光标契约/不可拖拽/无勾选框——刻意与 TaskItem 的形态区分。
              标题是按钮：点击 = 打开编辑抽屉（备忘无选中态，标题即最自然的编辑入口），
              同时是操作行的**键盘焦点锚**——display:none 的按钮不进 Tab 序，没有卡内可聚焦
              元素时 group-focus-within 永不触发、动作行对纯键盘用户不可达（TaskItem 的锚是
              常驻勾选框，机制同构，审查修复 2026-10-18） */}
          <div className="rounded-xl border bg-card px-3 py-3 transition-colors duration-200">
            <button
              type="button"
              onClick={() => openNoteEditor({ mode: "edit", id: noteItem.id })}
              className="block w-full truncate text-left text-[14px] font-medium"
            >
              {noteItem.title}
            </button>
            {noteItem.note.trim() !== "" && (
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                {noteItem.note}
              </p>
            )}
            <CreatedOnLabel noteItem={noteItem} lang={lang} />
          </div>

          {/* 卡下悬停操作行（TaskItem 同款）：静息 display:none 完全不占高，触屏常显；
              键盘路径 = Tab 聚焦上方标题按钮 → group-focus-within 浮出本行 → 按钮随后可达 */}
          <div className="mt-1 hidden flex-wrap items-center justify-end gap-1 group-focus-within/note:flex group-hover/note:flex max-[640px]:flex">
            <RowButton label={t("notes.convertHint", lang)} onClick={() => handleConvert(noteItem)}>
              <ListTodo className="size-4" />
              <span>{t("notes.convert", lang)}</span>
            </RowButton>
            <RowButton
              iconOnly
              label={t("action.edit", lang)}
              onClick={() => openNoteEditor({ mode: "edit", id: noteItem.id })}
            >
              <Pencil className="size-4" />
            </RowButton>
            <RowButton iconOnly label={t("action.delete", lang)} onClick={() => handleDelete(noteItem)}>
              <Trash2 className="size-4" />
            </RowButton>
          </div>
        </div>
      ))}
    </div>
  );
}

// 「记于 {日期}」尾行：createdAt 折算绝对日期（备忘的创建日永远在过去，绝对格式即正确语义，
// 与 TaskItem 的工作台锚点口径一致）；时间戳非法时整行隐藏（防御脏数据）
function CreatedOnLabel({ noteItem, lang }: { noteItem: NoteItem; lang: "zh-CN" | "en-US" }) {
  const created = new Date(noteItem.createdAt);
  if (Number.isNaN(created.getTime())) return null;
  return (
    <p className="mt-1 text-[12px] text-muted-foreground">
      {t("notes.createdOn", lang).replace("{date}", absoluteDateLabel(toDateKey(created), lang))}
    </p>
  );
}

// 空态占位（WorkbenchView 的 EmptyLine 同款局部复制，8 行不值得跨域抽共享）
function EmptyLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 px-3 py-6 text-[12px] text-muted-foreground">
      <Inbox className="size-4 opacity-50" />
      {text}
    </div>
  );
}

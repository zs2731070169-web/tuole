// 任务界面 Excel 导出 / 导入（纯前端离线，SheetJS）
// 导入前预览匹配结果：只添加新任务，或更新匹配任务并添加新任务。
import { useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { useTaskStore } from "../stores/useTaskStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useUiStore } from "../stores/useUiStore";
import { useCalendarStore } from "../stores/useCalendarStore";
import { useFilterStore } from "../stores/useFilterStore";
import { selectTasksForExcel } from "../lib/excelScope";
import { saveCurrentSnapshot } from "../services/backup";
import { t } from "../lib/i18n";
import type { Task } from "../shared/types";
import { planExcelImport } from "../shared/excelImport";
import { exportDesktopExcel, importDesktopExcel, isDesktopApp } from "../lib/desktopBridge";

interface Props {
  className?: string;
}

export function TaskIOButtons({ className }: Props) {
  const lang = useSettingsStore((s) => s.settings.language);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const busyRef = useRef(false);
  const [pending, setPending] = useState<Task[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  // 导入文件是否带「标签」/「分组」列：旧版导出没有这些列，「未提及」不得清空存量值
  const [hasTagsColumn, setHasTagsColumn] = useState(true);
  const [hasGroupColumn, setHasGroupColumn] = useState(true);

  const doExport = async () => {
    const ui = useUiStore.getState();
    const calendar = useCalendarStore.getState();
    const { tasks, fileName } = selectTasksForExcel(useTaskStore.getState().tasks, {
      view: ui.view,
      filter: useFilterStore.getState().filter,
      calendarDay: calendar.selectedDay,
      calendarAnchor: calendar.anchor,
      workbenchDay: ui.workbenchDay,
    });
    if (tasks.length === 0) {
      toast(t("io.exportEmpty", lang));
      return;
    }

    // Electron 走单次原生导出事务：主进程先打开保存面板，确认后才加载 SheetJS 并写盘；
    // 渲染层不再生成二进制、不再触发下载器，也不在弹窗前 setState。
    if (!isDesktopApp) {
      const { exportTasksToXlsx } = await import("../lib/excel");
      exportTasksToXlsx(tasks, fileName);
      toast.success(t("io.exportDone", lang).replace("{n}", String(tasks.length)));
      return;
    }

    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await exportDesktopExcel(tasks, {
        title: t("io.export", lang),
        defaultPath: fileName,
      });
      if (result && !result.canceled) {
        toast.success(t("io.exportDone", lang).replace("{n}", String(tasks.length)));
      }
    } catch {
      toast.error(t("io.exportFailed", lang));
    } finally {
      busyRef.current = false;
    }
  };

  const parseImported = async (buf: ArrayBuffer) => {
    try {
      // 仅浏览器降级路径、且在系统面板关闭后才加载 SheetJS；桌面端弹窗动画不再
      // 与这个大模块的解析/初始化共享同一渲染帧。
      const { parseTasksFromWorkbook } = await import("../lib/excel");
      const { tasks, skipped: sk, hasTagsColumn: withTags, hasGroupColumn: withGroup } = parseTasksFromWorkbook(buf);
      if (tasks.length === 0) {
        toast.error(t("io.importFailed", lang));
        return;
      }
      setSkipped(sk);
      setHasTagsColumn(withTags);
      setHasGroupColumn(withGroup);
      setPending(tasks);
    } catch {
      toast.error(t("io.importFailed", lang));
    }
  };

  const openImport = async () => {
    if (!isDesktopApp) {
      fileRef.current?.click();
      return;
    }

    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const opened = await importDesktopExcel({
        title: t("io.import", lang),
      });
      if (opened?.data) {
        await nextFrame();
        await parseImported(opened.data);
      }
    } catch {
      toast.error(t("io.importFailed", lang));
    } finally {
      busyRef.current = false;
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await parseImported(await file.arrayBuffer());
    } catch {
      toast.error(t("io.importFailed", lang));
    }
  };

  const importColumns = { incomingHasTagsColumn: hasTagsColumn, incomingHasGroupColumn: hasGroupColumn };
  const preview = pending ? planExcelImport(useTaskStore.getState().tasks, pending, "update", importColumns) : null;

  const apply = (mode: "merge" | "update") => {
    if (!pending) return;
    // 只更新匹配任务；覆盖前留恢复点。JSON/快照的全量恢复仍使用独立入口。
    if (mode === "update" && preview && preview.updated > 0) saveCurrentSnapshot();
    const result = useTaskStore.getState().importExcelTasks(pending, mode, importColumns);
    const msg = (mode === "update" ? t("io.importUpdated", lang) : t("io.importDone", lang))
      .replace("{added}", String(result.added))
      .replace("{matched}", String(result.matched))
      .replace("{updated}", String(result.updated));
    const extra = skipped > 0 ? t("io.importSkipped", lang).replace("{n}", String(skipped)) : "";
    const ambiguous = result.ambiguous > 0
      ? t("io.importAmbiguous", lang).replace("{n}", String(result.ambiguous))
      : "";
    toast.success(msg + extra + ambiguous);
    setPending(null);
    setSkipped(0);
    setHasTagsColumn(true);
    setHasGroupColumn(true);
  };

  const btnCls =
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <>
      <div className={cn("hidden items-center gap-1 lg:flex", className)}>
        {/* 按用户要求将导入放在导出前；图标仍保持语义：导入 = Download，导出 = Upload。 */}
        <button onClick={openImport} className={btnCls} title={t("io.import", lang)} aria-label={t("io.import", lang)}>
          <Download className="size-4" />
          <span>{t("io.import", lang)}</span>
        </button>
        <button onClick={doExport} className={btnCls} title={t("io.export", lang)} aria-label={t("io.export", lang)}>
          <Upload className="size-4" />
          <span>{t("io.export", lang)}</span>
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("io.moreActions", lang)}
            title={t("io.moreActions", lang)}
            className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <FileSpreadsheet className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={openImport}>
            <Download />
            {t("io.import", lang)}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={doExport}>
            <Upload />
            {t("io.export", lang)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />

      {pending && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPending(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border bg-card p-4 shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-status-today" />
              <h3 className="text-[14px] font-semibold">{t("io.import", lang)}</h3>
            </div>
            <p className="text-[13px] text-muted-foreground">{t("io.importConfirm", lang).replace("{n}", String(pending.length))}</p>
            <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-2 text-[12px] text-muted-foreground">
              {t("io.importPreview", lang)
                .replace("{matched}", String(preview?.matched ?? 0))
                .replace("{added}", String(preview?.added ?? 0))}
              {(preview?.ambiguous ?? 0) > 0 && (
                <span className="mt-1 block text-status-overdue">
                  {t("io.importAmbiguousPreview", lang).replace("{n}", String(preview?.ambiguous ?? 0))}
                </span>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPending(null)}
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted"
              >
                {t("action.cancel", lang)}
              </button>
              <button
                onClick={() => apply("update")}
                className="rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
              >
                {t("io.importUpdate", lang)}
              </button>
              <button
                onClick={() => apply("merge")}
                className="rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground hover:brightness-110"
              >
                {t("io.importMerge", lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// 备忘 Excel 导入 / 导出（2026-10-18 用户要求补上）：TaskIOButtons 同款外壳（宽屏双按钮 /
// 窄屏 FileSpreadsheet 下拉 + 预览弹窗），但导入为「只添加新」单动作——备忘仅标题/备注两字段，
// 去重规划见 shared/notes.planNotesImport（无任务的合并/更新双模式，v1 明确边界）。
// 导出范围 = 当前搜索 + 记于日期筛选后的可见列表（excelScope.selectNotesForExcel）。
import { useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { useNoteStore } from "../stores/useNoteStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useFilterStore } from "../stores/useFilterStore";
import { useUiStore } from "../stores/useUiStore";
import { selectNotesForExcel } from "../lib/excelScope";
import { planNotesImport } from "../shared/notes";
import { t } from "../lib/i18n";
import type { NoteItem } from "../shared/types";
import { exportDesktopExcel, importDesktopExcel, isDesktopApp } from "../lib/desktopBridge";

export function NoteIOButtons({ className }: { className?: string }) {
  const lang = useSettingsStore((s) => s.settings.language);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const busyRef = useRef(false);
  const [pending, setPending] = useState<NoteItem[] | null>(null);
  const [skipped, setSkipped] = useState(0);

  const doExport = async () => {
    const { notes, fileName } = selectNotesForExcel(useNoteStore.getState().notes, {
      filter: useFilterStore.getState().filter,
      // 导出范围跟随行首单日选择器的记于锚点（null = 全部日期）
      notesDay: useUiStore.getState().notesDay,
    });
    if (notes.length === 0) {
      toast(t("notes.io.exportEmpty", lang));
      return;
    }

    // Electron 走单次原生导出事务（kind 区分备忘工作簿），浏览器降级为渲染层写文件
    if (!isDesktopApp) {
      const { exportNotesToXlsx } = await import("../lib/excel");
      exportNotesToXlsx(notes, fileName);
      toast.success(t("notes.io.exportDone", lang).replace("{n}", String(notes.length)));
      return;
    }

    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await exportDesktopExcel(notes, {
        kind: "notes",
        title: t("io.export", lang),
        defaultPath: fileName,
      });
      if (result && !result.canceled) {
        toast.success(t("notes.io.exportDone", lang).replace("{n}", String(notes.length)));
      }
    } catch {
      toast.error(t("io.exportFailed", lang));
    } finally {
      busyRef.current = false;
    }
  };

  const parseImported = async (buf: ArrayBuffer) => {
    try {
      // 与 TaskIOButtons 同款：系统面板关闭后才动态加载 SheetJS 解析
      const { parseNotesFromWorkbook } = await import("../lib/excel");
      const { notes, skipped: sk } = parseNotesFromWorkbook(buf);
      if (notes.length === 0) {
        toast.error(t("io.importFailed", lang));
        return;
      }
      setSkipped(sk);
      setPending(notes);
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
      const opened = await importDesktopExcel({ title: t("io.import", lang) });
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

  // 预览计数在渲染时随最新存量重估（弹窗开着时列表不可达，此处只为口径单一）
  const preview = pending ? planNotesImport(useNoteStore.getState().notes, pending) : null;

  const applyImport = () => {
    if (!pending) return;
    const result = useNoteStore.getState().importNotes(pending);
    const msg = t("notes.io.importDone", lang)
      .replace("{added}", String(result.added))
      .replace("{existed}", String(result.existed));
    const extra = skipped > 0 ? t("io.importSkipped", lang).replace("{n}", String(skipped)) : "";
    toast.success(msg + extra);
    setPending(null);
    setSkipped(0);
  };

  const btnCls =
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <>
      <div className={cn("hidden items-center gap-1 lg:flex", className)}>
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
            <p className="text-[13px] text-muted-foreground">
              {t("notes.io.importConfirm", lang).replace("{n}", String(pending.length))}
            </p>
            <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-2 text-[12px] text-muted-foreground">
              {t("notes.io.importPreview", lang)
                .replace("{added}", String(preview?.added.length ?? 0))
                .replace("{existed}", String(preview?.existed ?? 0))}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPending(null)}
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted"
              >
                {t("action.cancel", lang)}
              </button>
              <button
                onClick={applyImport}
                className="rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground hover:brightness-110"
              >
                {t("notes.io.importAction", lang)}
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

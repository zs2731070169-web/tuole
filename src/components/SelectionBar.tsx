// 选中操作条：勾选任务（勾选框 / ⌘/Ctrl/Shift+点击）后的底部浮条，承载批量操作入口。
// 数据源是 checkedIds（打勾集合）——与单击高亮（selectedIds）分离，单击卡片不会唤出本条。
// 当前只有「批量删除」（删除前走全局组件化确认弹窗，与行内删除同一约束）；
// 历史版 BatchBar（改日期/优先级/顺延）已下线，需要其他批量动作时按需再加，勿一次堆满。
import { Trash2, X } from "lucide-react";
import { useTaskStore } from "../stores/useTaskStore";
import { useUiStore } from "../stores/useUiStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useConfirmStore } from "../stores/useConfirmStore";
import { t } from "../lib/i18n";

export function SelectionBar() {
  const lang = useSettingsStore((s) => s.settings.language);
  const checkedIds = useUiStore((s) => s.checkedIds);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const deleteTasks = useTaskStore((s) => s.deleteTasks);

  if (checkedIds.length === 0) return null;

  const deleteSelected = async () => {
    const message = t("confirm.deleteBatch", lang).replace("{n}", String(checkedIds.length));
    const confirmed = await useConfirmStore.getState().ask(message);
    if (!confirmed) return;
    deleteTasks(checkedIds);
    clearSelection();
  };

  return (
    // 外层 pointer-events-none 只做定位，内层卡片接管点击——不挡住底下内容的其他交互
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2 shadow-xl">
        <span className="px-1 text-[13px] font-medium text-foreground">
          {t("batch.selectedCount", lang).replace("{n}", String(checkedIds.length))}
        </span>
        <button
          onClick={clearSelection}
          aria-label={lang === "zh-CN" ? "取消选择" : "Clear selection"}
          title={lang === "zh-CN" ? "取消选择" : "Clear selection"}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <button
          onClick={deleteSelected}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-status-overdue/40 bg-status-overdue/10 px-3 text-[13px] font-medium text-status-overdue transition-colors hover:bg-status-overdue/20 active:scale-95"
        >
          <Trash2 className="size-4" />
          {t("batch.deleteSelected", lang)}
        </button>
      </div>
    </div>
  );
}

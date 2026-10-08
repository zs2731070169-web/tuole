// 「任务已保存到 {日期}」跳转横幅（第一方组件，2026-10 重写）：
// 新建草稿保存到非当前选中日时弹出，点「查看」= 视图 + 日期锚点双设置跳到该日工作台。
// 为什么不用 sonner toast 的 action 按钮：用户桌面端实测点击无响应——E2E（含真实鼠标
// 事件）三环境全过但真机不跳，第三方通知层在桌面壳里不可控（怀疑与标题栏拖拽区/层级
// 相关）；本组件是普通 React 元素 + 普通 button + 直接 store 调用，无任何中间层。
// 位置刻意放在 TopBar（69px + 拖拽区）之下的内容区上空，避开 desktop-titlebar 的
// -webkit-app-region: drag 区域，且 z-[70] 高于抽屉/Popover 的 z-50。
import { useEffect } from "react";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { format } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { useUiStore } from "../stores/useUiStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { fromDateKey } from "../lib/date";
import { t } from "../lib/i18n";

// 自动消失时长：给足点击窗口，但不长驻遮挡内容
const AUTO_DISMISS_MS = 10_000;

export function CreationJumpBanner() {
  const lang = useSettingsStore((s) => s.settings.language);
  const notice = useUiStore((s) => s.creationNotice);
  const dismiss = useUiStore((s) => s.dismissCreationNotice);

  // 自动消失；notice 更换（连续新建）时重置计时
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  if (!notice) return null;

  const locale = lang === "zh-CN" ? zhCN : enUS;
  const dayText = format(fromDateKey(notice.dateKey), lang === "zh-CN" ? "M月d日" : "MMM d", { locale });

  // 跳转 = 视图 + 锚点双设置：保存后用户可能切去了别的视图，只改锚点无可见效果
  const jumpToDay = () => {
    const ui = useUiStore.getState();
    ui.setView("workbench");
    ui.setWorkbenchDay(notice.dateKey);
    ui.dismissCreationNotice();
  };

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[76px] z-[70] flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3.5 py-2 shadow-lg">
        <CheckCircle2 className="size-4 shrink-0 text-status-done" />
        <span className="text-[13px] font-medium text-foreground">
          {t("notice.taskSaved", lang).replace("{date}", dayText)}
        </span>
        <button
          type="button"
          onClick={jumpToDay}
          className="ml-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-status-today px-2.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90 active:scale-95"
        >
          {t("notice.goView", lang)}
          <ArrowRight className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("action.cancel", lang)}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// 全局确认弹窗：挂在应用根节点（routes/index），任何地方
// `await useConfirmStore.getState().ask(message, options?)` 即可弹出确认。
// 删除、恢复等确认操作统一入口——勿再新起 window.confirm
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useConfirmStore } from "../stores/useConfirmStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { t } from "../lib/i18n";

export function ConfirmDialog() {
  const lang = useSettingsStore((s) => s.settings.language);
  const pending = useConfirmStore((s) => s.pending);
  const settle = useConfirmStore((s) => s.settle);

  return (
    <AlertDialog
      open={!!pending}
      // 取消按钮/遮罩/ESC 都会走到 open=false——统一按「取消」结算；
      // 确认按钮先 settle(true) 清空 pending，随后的关闭回调 settle 是空操作，不会二次结算
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirm.title", lang)}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("action.cancel", lang)}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={cn(
              // 浅色主题 primary 近黑，确认强调统一用语义色：删除 = overdue，恢复 = today
              pending?.tone === "accent"
                ? "border border-status-today/40 bg-status-today/15 text-status-today hover:bg-status-today/25"
                : "border border-status-overdue/40 bg-status-overdue/15 text-status-overdue hover:bg-status-overdue/25",
            )}
          >
            {pending?.confirmLabel ?? t("confirm.ok", lang)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

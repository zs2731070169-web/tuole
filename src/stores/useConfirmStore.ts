// 全局确认弹窗 store：ask(message, options?) 返回 Promise<boolean>，由应用根节点挂载的
// <ConfirmDialog />（shadcn AlertDialog）承接用户选择——取代 window.confirm。
// 删除、恢复等需要确认的操作统一走这里，并可按语义定制确认按钮。
import { create } from "zustand";

interface ConfirmOptions {
  confirmLabel?: string;
  tone?: "danger" | "accent";
}

interface ConfirmRequest extends ConfirmOptions {
  message: string; // 确认文案（已含数量/标题等上下文）
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  pending: ConfirmRequest | null;
  /** 弹出确认框；resolve(true)=确认，resolve(false)=取消（含遮罩/ESC/取消按钮） */
  ask: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  ask: (message, options) =>
    new Promise<boolean>((resolve) => {
      // 同一时刻只承接一个确认（后到的覆盖先前的并按取消结算，避免 Promise 悬挂）
      get().pending?.resolve(false);
      set({ pending: { message, resolve, ...options } });
    }),
  settle: (ok) => {
    const pending = get().pending;
    set({ pending: null });
    pending?.resolve(ok);
  },
}));

// 行内操作按钮（2026-10-18 自 TaskItem 抽出为共享组件，NotesView 复用）：
// h-8（32px）方形热区，图标 + 可选短文字；窄栏下靠 aria-label/title 表意。
// 不做持续高亮的 active 态——用户要求按钮点击后外观自动恢复常态（勿加回）。
// 契约：必须转发 ref 并透传其余 props——「安排到…」把本组件用作 Radix PopoverTrigger(asChild)
// 的子元素，若丢弃 ref，Popper 拿不到锚点几何，弹层会被定位到视口外（表现为点击无响应）。
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const RowButton = forwardRef<
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

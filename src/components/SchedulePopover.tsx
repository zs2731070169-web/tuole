// 排期/选日弹层：把任务安排到「任意一天」。快捷项仅保留「今天」，其余走单选日历
// （产品要求：不要加回明天/下周一等快捷项）。落库统一由父级回调（scheduleTo / setWorkbenchDay），
// 本组件不含任何改状态控件。
// 红线：**只允许单日选择**（2026-10 用户两次确认：一次只选一天，不支持连续多天区间；
// 需要改截止日 dueDate 走编辑抽屉的 DateRangeField）。勿加回 mode="range" 范围模式——
// 曾因区间版「单击并进旧锚点/任务迁栏导致弹层卸载」反复返工，单日模式选择即提交即关闭，无这些问题。
import { useState } from "react";
import { Check } from "lucide-react";
import { zhCN, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import type { Lang } from "../lib/i18n";
import { t } from "../lib/i18n";
import { todayKey, toDateKey, fromDateKey } from "../lib/date";

interface Props {
  lang: Lang;
  /** 选中某天（含快捷项）后回调，父级负责落库 */
  onPick: (dateKey: string) => void;
  /** 触发器外观由父级决定（行内按钮 / 栏头按钮） */
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  /** 弹层底部说明文案；默认为排期语境，作「选日查看」等其他用途时可覆写 */
  hint?: string;
  /** 当前已选日期（日历中高亮）；默认不高亮 */
  selectedKey?: string;
  /** 可选「清除」快捷项（如备忘选日的「全部日期」）：提供时在快捷行首位渲染并回调 null 语义 */
  onClear?: () => void;
  clearLabel?: string;
}

export function SchedulePopover({ lang, onPick, children, align = "start", hint, selectedKey, onClear, clearLabel }: Props) {
  const [open, setOpen] = useState(false);
  const zh = lang === "zh-CN";
  const today = todayKey();

  // 快捷项只留「今天」：其余日期走下方日历（勿加回明天/下周一）
  const presets: { label: string; key: string }[] = [{ label: t("date.today", lang), key: today }];

  const pick = (key: string) => {
    onPick(key);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <div className="flex flex-wrap gap-1 border-b px-2.5 py-2">
          {onClear && (
            <button
              type="button"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5",
                "text-[12px] font-medium text-foreground transition-colors hover:bg-muted active:scale-95",
              )}
            >
              {clearLabel}
            </button>
          )}
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pick(p.key)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5",
                "text-[12px] font-medium text-foreground transition-colors hover:bg-muted active:scale-95",
              )}
            >
              <Check className="size-3 opacity-60" />
              {p.label}
            </button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={selectedKey ? fromDateKey(selectedKey) : undefined}
          onSelect={(d) => {
            if (d) pick(toDateKey(d));
          }}
          weekStartsOn={1}
          locale={zh ? zhCN : enUS}
          captionLayout="dropdown"
          className="p-2"
        />
        <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {hint ?? (zh ? "选一天即可安排；未来排期可在日历或全部视图查看" : "Pick a day to schedule; future items live in Calendar or All")}
        </p>
      </PopoverContent>
    </Popover>
  );
}

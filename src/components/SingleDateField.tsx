// 单日选择字段：留作单日排期入口；任务编辑抽屉已改用执行期 DateRangeField。
// 本组件自身只选一个日期；任务执行期由 DateRangeField 设置。纯受控组件，值与落库由父级管理。
import { useState } from "react";
import { CalendarDays, Check, ChevronDown, Eraser } from "lucide-react";
import { zhCN, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import type { Lang } from "../lib/i18n";
import { t } from "../lib/i18n";
import { friendlyDate, fromDateKey, toDateKey, todayKey } from "../lib/date";

interface Props {
  lang: Lang;
  /** 当前安排日（YYYY-MM-DD）；null = 未安排 */
  value: string | null;
  /** 选定某天或清除（null = 回未安排）；父级负责落库 */
  onChange: (dateKey: string | null) => void;
  /** 无值时的占位文案；默认「未安排日期」 */
  placeholder?: string;
}

export function SingleDateField({ lang, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const zh = lang === "zh-CN";

  // 选定/清除即提交并关弹层——单日语义没有第二步，不需要保持打开
  const pick = (key: string | null) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={zh ? "选择日期（单日）" : "Pick a date (single day)"}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-left text-[13px] transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate tabular-nums">
            {value ? friendlyDate(value, lang) : (placeholder ?? (zh ? "未安排日期" : "No date set"))}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {/* 快捷项：今天 / 清除（回未安排）；各自即选即关 */}
        <div className="flex flex-wrap gap-1 border-b px-2.5 py-2">
          <button
            type="button"
            onClick={() => pick(todayKey())}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted active:scale-95"
          >
            <Check className="size-3 opacity-60" />
            {t("date.today", lang)}
          </button>
          <button
            type="button"
            onClick={() => pick(null)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
          >
            <Eraser className="size-3 opacity-60" />
            {t("action.unschedule", lang)}
          </button>
        </div>
        <Calendar
          mode="single"
          selected={value ? fromDateKey(value) : undefined}
          onSelect={(d) => {
            if (d) pick(toDateKey(d));
          }}
          weekStartsOn={1}
          locale={zh ? zhCN : enUS}
          captionLayout="dropdown"
          className="p-2"
        />
        <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {zh ? "一次只选一天" : "Pick a single day"}
        </p>
      </PopoverContent>
    </Popover>
  );
}

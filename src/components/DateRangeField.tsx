// 日期区间：单个触发器 + 一个日历弹层，一次拖选出「起始 → 截止」即完成设置
// 任务编辑语境：起始 = task.scheduledDate，终点 = task.dueDate；筛选工具行也复用本组件。
// 红线：这里只改日期，绝不出现任何「修改状态」控件
import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarRange, ChevronDown, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import type { Lang } from "../lib/i18n";
import { addDays, fromDateKey, toDateKey, todayKey } from "../lib/date";

export interface DateSpan {
  start: string | null;
  end: string | null;
}

interface Props {
  start: string | null; // 'YYYY-MM-DD'
  end: string | null; // 'YYYY-MM-DD'
  onChange: (span: DateSpan) => void;
  lang: Lang;
  /** 无值时的占位文案；默认「未安排日期」（任务编辑语境），筛选语境可传「不限日期」 */
  placeholder?: string;
  /** 无起始日时日历弹层的默认锚点日（'YYYY-MM-DD'）：编辑抽屉传任务停靠日/工作台选中日，
   *  让日历直接翻到任务所属月份、且该日承载「今天」样式高亮（DayPicker today 属性覆写——
   *  月份锚定在同月时不可见，天级高亮才是用户感知的「默认所选」）；缺失或非法回落今天。
   *  有起始日时不起作用（仍锚起始月、真实今天恢复高亮） */
  anchorDay?: string | null;
  /** 触发器高度档位：md = h-9（编辑抽屉，默认）；sm = h-7（ViewToolbar 行内筛选胶囊内嵌，
   *  与同行搜索框/按钮的 36px 行高对齐——胶囊 p-1 + 28px 触发器 = 36px） */
  size?: "md" | "sm";
  /** 是否允许清空。筛选器需要清空；任务日期按「始终存在」口径关闭。 */
  allowClear?: boolean;
}

export function DateRangeField({ start, end, onChange, lang, placeholder, anchorDay, size = "md", allowClear = true }: Props) {
  const zh = lang === "zh-CN";
  const [open, setOpen] = useState(false);
  // 本地草稿：每次打开弹层都从最新入库值重置，避免连续开合串值
  const [draft, setDraft] = useState<DateRange | undefined>(toRange(start, end));
  // 无起始日时的默认月份锚点：anchorDay 优先，非法/缺失回落今天（2026-10-09 用户决策：
  // 编辑抽屉日历默认定位到任务所属日子，而非机械地翻到今天）。
  // 同日兼作 today 覆写值——「默认所选」的视觉落点是天级高亮，仅锚月份在同月时不可见
  const anchorMonth = resolveAnchorMonth(anchorDay);

  useEffect(() => {
    if (open) setDraft(toRange(start, end));
  }, [open, start, end]);

  const commit = (next: DateSpan) => {
    let s = next.start;
    let e = next.end;
    // 逆序终点归一为单日；任务编辑器在保存时再把同日终点归一为 null。
    if (s && e && e < s) e = null;
    onChange({ start: s, end: e });
  };

  const pick = (r: DateRange | undefined) => {
    setDraft(r);
    commit({ start: r?.from ? toDateKey(r.from) : null, end: r?.to ? toDateKey(r.to) : null });
  };

  const label = formatSpan(start, end, lang);

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={zh ? "选择日期区间" : "Select date range"}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-left text-[13px] transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none",
              size === "sm" ? "h-7" : "h-9",
              !start && "text-muted-foreground",
            )}
          >
            <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate tabular-nums">{label || placeholder || (zh ? "未安排日期" : "No dates set")}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={draft}
            onSelect={pick}
            numberOfMonths={2}
            // 双月恒相邻：边界周（左月尾部 + 右月头部）的 outside 补位格会在两个面板各渲染
            // 一遍 = 同一日期出现两次（2026-10-10 用户实测），关掉补位；单月实例保留补位
            showOutsideDays={false}
            defaultMonth={draft?.from ?? anchorMonth}
            today={draft?.from ? undefined : anchorMonth}
            weekStartsOn={1}
            className="max-[420px]:hidden"
          />
          {/* 窄屏只给单月，双月会溢出视口 */}
          <Calendar
            mode="range"
            selected={draft}
            onSelect={pick}
            numberOfMonths={1}
            defaultMonth={draft?.from ?? anchorMonth}
            today={draft?.from ? undefined : anchorMonth}
            weekStartsOn={1}
            className="min-[421px]:hidden"
          />
          <div className="flex items-center gap-1.5 border-t px-3 py-2">
            <Chip
              onClick={() =>
                pick({ from: fromDateKey(todayKey()), to: addWeekEnd() })
              }
            >
              {zh ? "今天起一周" : "Today + 1 week"}
            </Chip>
            {allowClear && (
              <Chip
                tone="muted"
                onClick={() => {
                  setDraft(undefined);
                  commit({ start: null, end: null });
                }}
              >
                <Eraser className="size-3" />
                {zh ? "清除" : "Clear"}
              </Chip>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Chip({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone?: "muted" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        tone === "muted"
          ? "ml-auto text-muted-foreground hover:bg-muted hover:text-foreground"
          : "bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      {children}
    </button>
  );
}

function toRange(start: string | null, end: string | null): DateRange | undefined {
  if (!start) return undefined;
  const from = fromDateKey(start);
  return { from, to: end ? fromDateKey(end) : undefined };
}

/** 锚点日 → 日历默认月份；锚点缺失或非法（解析出 Invalid Date）回落今天 */
function resolveAnchorMonth(anchorDay: string | null | undefined): Date {
  if (anchorDay) {
    const candidate = fromDateKey(anchorDay);
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }
  return fromDateKey(todayKey());
}

function addWeekEnd(): Date {
  return addDays(fromDateKey(todayKey()), 6);
}

function formatSpan(start: string | null, end: string | null, lang: Lang): string {
  if (!start) return "";
  const zh = lang === "zh-CN";
  const fmt = (k: string) =>
    fromDateKey(k).toLocaleDateString(zh ? "zh-CN" : "en-US", { month: "numeric", day: "numeric" });
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} → ${fmt(end)}`;
}

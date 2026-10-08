// 状态筛选器（只读查看视角）：全部/进行中/逾期/未安排/已完成
// 红线：这里只切换「看什么」，不写任何任务状态
// 「今天」不作为独立维度：它是时间位置而非生命周期状态，含在「进行中」内；
// 「未安排」独立成维（2026-10 用户决策），「进行中」= 今天 + 未来安排
import { cn } from "@/lib/utils";
import { STATUS_FILTER_OPTIONS } from "../shared/constants";
import type { StatusFilterKey, TaskView } from "../shared/types";
import { useSettingsStore } from "../stores/useSettingsStore";

interface Props {
  value: StatusFilterKey;
  onChange: (k: StatusFilterKey) => void;
  views: TaskView[]; // 用于显示每个视角的计数
}

export function StatusFilterBar({ value, onChange, views }: Props) {
  const lang = useSettingsStore((s) => s.settings.language);

  const countFor = (k: StatusFilterKey): number => {
    switch (k) {
      case "all":
        return views.length;
      case "active":
        return views.filter((v) => ["upcoming", "today"].includes(v.status)).length;
      case "overdue":
        return views.filter((v) => v.status === "overdue").length;
      case "unscheduled":
        return views.filter((v) => v.status === "unscheduled").length;
      case "done":
        return views.filter((v) => v.status === "done").length;
      default:
        return 0;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={lang === "zh-CN" ? "按状态筛选（仅查看）" : "Filter by status (view only)"}
      className="flex flex-wrap items-center gap-1 rounded-xl bg-muted/60 p-1"
    >
      {STATUS_FILTER_OPTIONS.map((opt) => {
        const active = opt.key === value;
        const n = countFor(opt.key);
        return (
          <button
            key={opt.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className={cn(
              // h-7 + 容器 p-1 = 36px，与 ViewToolbar 行的 h-9 控件行高对齐；
              // transition-colors 而非 transition-all——全属性过渡会引发 Chromium 光标闪烁（见 AGENTS.md Lessons）
              "group inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors duration-200",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            {opt.key === "overdue" && n > 0 && !active && (
              <span className="size-1.5 rounded-full bg-status-overdue" />
            )}
            <span>{lang === "zh-CN" ? opt.labelZh : opt.labelEn}</span>
            <span
              className={cn(
                "min-w-[18px] rounded-full px-1 text-center text-[11px] tabular-nums leading-[18px]",
                active ? "bg-primary/10 text-primary" : "bg-muted-foreground/10 text-muted-foreground",
              )}
            >
              {n}
            </span>
          </button>
        );
      })}
    </div>
  );
}

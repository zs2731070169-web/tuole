// 优先级标记：高/中/低/无 —— 用色点 + 文字表达，非可点击的状态控件
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { Priority } from "../shared/types";

const mark = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-none", {
  variants: {
    priority: {
      high: "bg-priority-high/12 text-priority-high",
      medium: "bg-priority-medium/15 text-priority-medium",
      low: "bg-priority-low/15 text-priority-low",
      none: "bg-muted text-muted-foreground",
    },
  },
  defaultVariants: { priority: "none" },
});

const DOT: Record<Priority, string> = {
  high: "bg-priority-high",
  medium: "bg-priority-medium",
  low: "bg-priority-low",
  none: "bg-muted-foreground/40",
};

const LABEL_ZH: Record<Priority, string> = { high: "高", medium: "中", low: "低", none: "无" };
const LABEL_EN: Record<Priority, string> = { high: "High", medium: "Med", low: "Low", none: "None" };

interface Props extends VariantProps<typeof mark> {
  priority: Priority;
  lang?: "zh-CN" | "en-US";
}

export function PriorityMark({ priority, lang = "zh-CN" }: Props) {
  return (
    <span className={cn(mark({ priority }))}>
      <span className={cn("size-1.5 rounded-full", DOT[priority])} />
      {lang === "zh-CN" ? LABEL_ZH[priority] : LABEL_EN[priority]}
    </span>
  );
}

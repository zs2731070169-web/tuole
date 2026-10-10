// 日历 chip 的分组/状态着色契约（2026-10-09 分组色档落地；2026-10-10 用户决策升格）。
// **背景通道 = 分组**：同分组的任务在日历格内 chip 与「+N 更多」浮层条目一律用同一
// 浅色填充（group-tone-bg-N，档位 = 分组名哈希，见 shared/groups.ts），与生命周期无关——
// 旧口径「仅活动任务（today/upcoming）着分组色」会让同组任务在不同状态下底色不一致、
// 无法成块识别，已废弃。
// **文字通道 = 状态**：活动（today/upcoming）沿用分组深字（既有观感）；逾期红字、
// 已完成灰字 + 自绘删除线、未安排灰字——状态语义不再占用背景，可辨识性由文字承载。
// 无分组任务整体走状态色（背景 + 文字），与旧口径一致。
// 任务卡元信息行 / 编辑抽屉的分组 chip 用「浅底 + 深字」整对类作「颜色 ↔ 分组」锚点
//（groupToneClass，见 TaskItem / TaskEditor）。
import { groupToneBgClass, groupToneClass } from "./groups";
import type { TaskView } from "./types";

// 已完成任务的自绘删除线：CSS line-through 的纵向位置由字体度量决定（中文字形 11px
// 小字号下普遍偏上约 30% 高度），且无属性可调（text-underline-offset 只作用于下划线）；
// 改用伪元素锚定行盒几何中心（top-1/2 + 上移半像素），与字体解耦。1px、半透明灰；
// 两端缩进 6px（对齐 chip 的 px-1.5 文字边距），不贴边
const STRIKE_LINE =
  "relative after:pointer-events-none after:absolute after:left-1.5 after:right-1.5 after:top-1/2 after:h-px after:-translate-y-1/2 after:bg-muted-foreground/70 after:content-['']";

// 无分组任务的状态 chip：背景 + 文字整对状态色（带分组的任务背景让位给分组，见文件头）
function statusChip(status: TaskView["status"]): string {
  switch (status) {
    case "today":
      return "bg-status-today/15 text-status-today";
    case "upcoming":
      return "bg-status-upcoming/15 text-foreground";
    case "overdue":
      return "bg-status-overdue/15 text-status-overdue";
    case "done":
      // 已完成：自绘删除线（见 STRIKE_LINE 注释）+ 淡绿底灰字
      return `bg-status-done/10 text-muted-foreground/70 ${STRIKE_LINE}`;
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** 日历 chip 着色：背景 = 分组（同组同浅底），文字 = 状态；无分组整对状态色 */
export function calendarChipTone(task: Pick<TaskView, "group" | "status">): string {
  if (task.group) {
    switch (task.status) {
      case "today":
      case "upcoming":
        // 活动态：分组浅底 + 分组深字（既有观感，保持不变）
        return groupToneClass(task.group);
      case "overdue":
        // 欠账红退到文字通道，浅底仍归分组
        return `${groupToneBgClass(task.group)} text-status-overdue`;
      case "done":
        // 完成语义 = 灰字 + 自绘删除线，浅底归分组
        return `${groupToneBgClass(task.group)} text-muted-foreground/70 ${STRIKE_LINE}`;
      default:
        // 未安排停靠 chip：灰字 + 分组浅底
        return `${groupToneBgClass(task.group)} text-muted-foreground`;
    }
  }
  return statusChip(task.status);
}

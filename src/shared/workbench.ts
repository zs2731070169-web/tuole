// 工作台分桶纯逻辑：把派生后的 TaskView[] 按「选中日」拆成 未安排/进行中/逾期/已完成 四栏数据。
// 选中日默认今天、可在栏头改选；抽成纯函数是为了给「按任意一天查看」的口径建立单测锚点。
import type { TaskView } from "./types";
import { todayKey } from "../lib/date";
import { scheduledOnDay } from "./taskDates";

export interface WorkbenchColumns {
  unscheduled: TaskView[]; // 未安排：停靠在选中日的暂存任务 + 覆盖选中日但**尚未开始**（执行首日 > 今天）的任务
  dayList: TaskView[]; // 进行中：执行期覆盖选中日、**已开始**（执行首日 ≤ 今天）且未完成（含历史日的逾期任务）
  overdue: TaskView[]; // 逾期：执行期已结束、未完成且不覆盖选中日
  doneOnDay: TaskView[]; // 已完成且 scheduledDates 归属选中日；completedAt 只记实际完成时刻，不换日
  ahead: number; // 已排在未来（真实今天之后）的任务数
}

export function bucketWorkbenchColumns(
  views: TaskView[],
  workbenchDay: string,
  today = todayKey(),
): WorkbenchColumns {
  const unscheduled: TaskView[] = [];
  const dayList: TaskView[] = [];
  const overdue: TaskView[] = [];
  const doneOnDay: TaskView[] = [];
  let ahead = 0;

  for (const v of views) {
    if (v.status === "unscheduled") {
      // 未安排任务也有独立日期：只在所属日的未安排栏出现。
      // parkedDate 仅作为迁移前历史数据的防御兜底。
      if (scheduledOnDay(v, workbenchDay) || (v.scheduledDates.length === 0 && (v.parkedDate ?? today) === workbenchDay)) {
        unscheduled.push(v);
      }
    } else if (v.status === "done") {
      // 已完成任务仍按原所属日进栏，完成动作不改日期归属。
      if (scheduledOnDay(v, workbenchDay)) doneOnDay.push(v);
    } else if (scheduledOnDay(v, workbenchDay)) {
      // 已点「安排」即进进行中栏；日期只决定它在哪一天出现。
      dayList.push(v);
    } else if (v.status === "overdue") {
      // 独立「逾期」栏：不在选中日的往日欠账（查看任何一天都展示，不随选中日隐藏）
      overdue.push(v);
    } else if (v.status === "upcoming") {
      ahead += 1;
    }
  }

  // 各栏按 sortOrder 升序（含已完成——栏内拖拽排序对三栏一致生效；sortOrder 创建时为时间戳、
  // 栏内重排后由 store.reorder 重写为栏内索引，只影响本栏相对顺序）
  const bySort = (a: TaskView, b: TaskView) => a.sortOrder - b.sortOrder;
  unscheduled.sort(bySort);
  dayList.sort(bySort);
  overdue.sort(bySort);
  doneOnDay.sort(bySort);
  return { unscheduled, dayList, overdue, doneOnDay, ahead };
}

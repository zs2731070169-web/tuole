// 工作台分桶纯逻辑：把派生后的 TaskView[] 按「选中日」拆成 未安排/进行中/逾期/已完成 四栏数据。
// 选中日默认今天、可在栏头改选；抽成纯函数是为了给「按任意一天查看」的口径建立单测锚点。
import type { TaskView } from "./types";
import { todayKey, toDateKey } from "../lib/date";
import { scheduledOnDay } from "./taskDates";

export interface WorkbenchColumns {
  unscheduled: TaskView[]; // 未安排：停靠在选中日的暂存任务（按日隔离，与进行中一样跟着日期走）
  dayList: TaskView[]; // 进行中：执行期覆盖选中日、未完成（含历史日的逾期任务）
  overdue: TaskView[]; // 逾期：执行期已结束、未完成且不覆盖选中日
  doneOnDay: TaskView[]; // 选中日当天完成——已完成栏只收当天完成的（早于选中日完成的不展示，折叠组已按需求移除）
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
      // 未安排按「停靠日」归栏：只进所属日的未安排栏（parkedDate 缺失兜底今天，
      // 兼容迁移前历史数据；启动 init 会统一补齐）
      if ((v.parkedDate ?? today) === workbenchDay) unscheduled.push(v);
    } else if (v.status === "done") {
      // 已结束按完成日归桶：只有落在选中日才进已完成栏；
      // 完成日早于选中日的不进工作台任何栏（原「本周稍早」折叠组已按需求移除）
      const stamp = v.completedAt;
      const key = stamp ? toDateKey(new Date(stamp)) : workbenchDay;
      if (key === workbenchDay) doneOnDay.push(v);
    } else if (scheduledOnDay(v, workbenchDay)) {
      // 工作台日期是查看视角：任务执行期覆盖选中日，就进入当天「进行中」栏。
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

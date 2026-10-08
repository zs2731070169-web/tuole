// 渲染层负责跨午夜刷新日期状态；浏览器版也在这里轮询到期提醒。
// 桌面版的提醒完全由 Electron 主进程调度。
import { useTaskStore } from "../stores/useTaskStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { todayKey } from "../lib/date";
import { deliverReminder } from "../lib/notify";
import { isDesktopApp } from "../lib/desktopBridge";

let timer: ReturnType<typeof setTimeout> | null = null;
let reminderTimer: ReturnType<typeof setInterval> | null = null;
let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
let lastSettledDay: string | null = null;
const firedReminders = new Set<string>();

/** 立即标记当前日期已检查；任务状态在视图层按当前日期实时派生。 */
export function runSettlement(): void {
  const now = new Date();
  lastSettledDay = todayKey(now);
}

/** 距下一个 00:00 的毫秒数 */
function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime() + 1000; // 多给 1s 跨过边界
}

function scheduleNextMidnight(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    runSettlement();
    checkReminders();
    scheduleNextMidnight();
  }, msUntilMidnight());
}

/** 解析提醒时间为「当日分钟数」（与当前时刻比较用）；非法值回退默认 9:00（540） */
export function reminderMinutesOfDay(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return 9 * 60;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return 9 * 60;
  return hours * 60 + minutes;
}

/** 手动输入的提醒时间归一化为 "HH:MM"（支持 "9"、"9:5"、"0930"、"09：30" 全角冒号）；非法返回 null，由调用方回退原值 */
export function normalizeReminderTime(raw: string): string | null {
  const m = /^(\d{1,2})[:：]?(\d{0,2})$/.exec(raw.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** 浏览器版到期提醒：过了设置时间后聚合今天/逾期的未结束任务。
 *  投递走 lib/notify，应用内 toast + 音效为主，系统通知为后台补充。
 *  桌面版在主进程读取磁盘任务、调度及投递，不经过此函数。 */
export function checkReminders(): void {
  if (isDesktopApp) return; // 桌面版由主进程读取磁盘数据并独立调度，避免双重投递。
  const settings = useSettingsStore.getState().settings;
  if (!settings.reminderEnabled) return;

  const now = new Date();
  const today = todayKey(now);
  // 当前时刻与提醒时间都折算成「当日分钟数」再比较，支持 HH:MM 精度；未到点整轮跳过
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const fireAtMinutes = reminderMinutesOfDay(settings.reminderTime);
  if (nowMinutes < fireAtMinutes) return;

  const views = useTaskStore.getState().views();
  // 当天提醒时刻之后才创建/改动的任务当天不进提醒（与桌面主进程 reminder.cjs 同口径）：
  // 新建/编辑的保存反馈由顶部 toast 承担，紧随其后的提醒弹窗构成「双弹」打扰——
  // 排到过去日期的新任务一保存即成逾期，会被本轮扫描立刻捕获；次日提醒恢复正常
  const fireMoment = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, fireAtMinutes).getTime();
  const due = views.filter((t) => {
    if ((t.status !== "today" && t.status !== "overdue") || firedReminders.has(`${t.id}:${today}`)) return false;
    const touched = Date.parse(t.updatedAt ?? t.createdAt ?? "");
    return !(Number.isFinite(touched) && touched > fireMoment);
  });
  if (due.length === 0) return;
  for (const t of due) firedReminders.add(`${t.id}:${today}`);

  const zh = settings.language === "zh-CN";
  const todayCount = due.filter((t) => t.status === "today").length;
  const overdueCount = due.length - todayCount;
  const title = zh
    ? `今日提醒：${todayCount} 项今天 · ${overdueCount} 项逾期`
    : `Reminder: ${todayCount} today · ${overdueCount} overdue`;
  const sampleTitles = due.slice(0, 3).map((t) => t.title).join(zh ? "、" : ", ");
  const body =
    due.length > 3 ? `${sampleTitles}${zh ? ` 等 ${due.length} 项` : ` +${due.length - 3} more`}` : sampleTitles;
  deliverReminder(title, body || undefined);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  const p = await Notification.requestPermission();
  return p === "granted";
}

// 页面重新可见时补结算（处理电脑休眠跨过午夜的情况）。
// 延后一个短任务，让原生文件选择器/系统窗口退出后浏览器先完成首帧绘制，避免同步扫描任务造成焦点恢复顿挫。
function handleVisibilityChange(): void {
  if (document.visibilityState !== "visible") return;
  if (visibilityTimer) clearTimeout(visibilityTimer);
  visibilityTimer = setTimeout(() => {
    visibilityTimer = null;
    if (document.visibilityState !== "visible") return;
    if (lastSettledDay !== todayKey()) runSettlement();
    checkReminders();
  }, 100);
}

/** 启动调度器：立即结算 + 注册跨天定时器 + 周期检查提醒；重复调用保持单例 */
export function startScheduler(): void {
  // React Strict Mode 开发环境会执行 effect 的 setup → cleanup → setup；先清理可避免重复 interval/listener。
  stopScheduler();
  runSettlement();
  scheduleNextMidnight();
  if (!isDesktopApp) {
    checkReminders();
    reminderTimer = setInterval(checkReminders, 60 * 1000);
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

export function stopScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = null;
  if (visibilityTimer) clearTimeout(visibilityTimer);
  visibilityTimer = null;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }
}

// 供测试/调试：判断某任务是否应在今日聚合中显眼呈现（today + overdue）
export function isTodayAggregate(task: { status: string }): boolean {
  return task.status === "today" || task.status === "overdue";
}

export { lastSettledDay };

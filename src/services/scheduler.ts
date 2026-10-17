// 渲染层调度器：跨午夜 + visibilitychange 的日期结算，并在进入新的一天时生成当日摘要消息。
// 2026-10-18 提醒重构：固定时间提醒（浏览器 60s 轮询 + toast/音效投递、桌面主进程浮窗）已整体下线，
// 提醒改为「每天首次启动 / 进入新一天时生成摘要进消息中心」——见 stores/useMessageStore。
import { useMessageStore } from "../stores/useMessageStore";
import { todayKey } from "../lib/date";

let timer: ReturnType<typeof setTimeout> | null = null;
let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
let lastSettledDay: string | null = null;

/** 立即结算当前日期；进入新的一天时生成当日摘要（幂等——当天已生成/无事可报/开关关闭都零副作用）。
 *  导出供测试直接触发（startScheduler 之外的单点验证入口） */
export function runSettlement(): void {
  const day = todayKey();
  const dayChanged = lastSettledDay !== day;
  lastSettledDay = day;
  if (dayChanged) useMessageStore.getState().ensureDailyDigest(day);
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
    scheduleNextMidnight();
  }, msUntilMidnight());
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
  }, 100);
}

/** 启动调度器：立即结算（含当日摘要生成）+ 注册跨天定时器；重复调用保持单例 */
export function startScheduler(): void {
  // React Strict Mode 开发环境会执行 effect 的 setup → cleanup → setup；先清理可避免重复 interval/listener。
  stopScheduler();
  runSettlement();
  scheduleNextMidnight();
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

export function stopScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (visibilityTimer) clearTimeout(visibilityTimer);
  visibilityTimer = null;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }
}

// 浏览器提醒投递通道：应用内 toast + 合成音效，不依赖 Notification 权限（沙箱 iframe /
// 用户曾拒绝授权时 requestPermission 永远拿不到 granted，旧实现「无权限即整体静默」
// 导致提醒从不触发，2026-10 用户实测反馈）；权限已授予时另发系统通知，覆盖后台标签页场景。
import { toast } from "sonner";

let audioContext: AudioContext | null = null;

/** 应用内提醒音效：两个短促上行音（WebAudio 现场合成，零资源文件依赖；环境不支持时静默） */
export function playReminderChime(): void {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
    const startAt = audioContext.currentTime;
    for (const [index, frequency] of [880, 1174.66].entries()) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      // 起音 20ms 爬升 + 140ms 衰减：短促清脆，音量克制
      gain.gain.setValueAtTime(0.0001, startAt + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.16, startAt + index * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + index * 0.18 + 0.16);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(startAt + index * 0.18);
      oscillator.stop(startAt + index * 0.18 + 0.18);
    }
  } catch {
    /* 音效是尽力而为：无声卡 / 自动播放策略拦截时静默失败，不影响提示本体 */
  }
}

/** 投递一条浏览器提醒：应用内 toast + 音效，后台标签页（document.hidden）
 *  且已授权时补发系统通知——toast 在后台看不见，系统横幅补位；前台不重复弹横幅。 */
export function deliverReminder(title: string, body?: string): void {
  playReminderChime();
  toast(title, { description: body, duration: 8000 });
  if (
    typeof document !== "undefined" &&
    document.hidden &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    try {
      new Notification(title, { body });
    } catch {
      /* 系统通知失败不影响应用内提醒 */
    }
  }
}

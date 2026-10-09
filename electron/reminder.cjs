// 桌面提醒的纯逻辑：由 Electron 主进程读取磁盘数据并按墙上时钟检查。
// 不依赖渲染页面的定时器、可见性、Web Notification 权限或 WebAudio 自动播放策略。

const CHECK_INTERVAL_MS = 15_000;

function localDayKey(now) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function reminderMinutesOfDay(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(typeof value === "string" ? value.trim() : "");
  if (!match) return 9 * 60;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : 9 * 60;
}

// 执行期 = 日期集合（2026-10-09 模型改造）；磁盘上渲染层完成一次写盘前可能仍是旧区间键，
// 此处双读展开（与 storage.ts 迁移单点同口径的只读版）
function taskDays(task) {
  if (Array.isArray(task.scheduledDates)) return task.scheduledDates;
  if (typeof task.scheduledDate === "string") {
    const end = typeof task.dueDate === "string" && task.dueDate >= task.scheduledDate ? task.dueDate : task.scheduledDate;
    const days = [];
    const cursor = new Date(`${task.scheduledDate}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    // 3700 天 ≈ 10 年封顶，防脏数据死循环
    for (let i = 0; i < 3700 && cursor <= endDate; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      days.push(key);
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }
  return [];
}

function dueKind(task, day) {
  if (!task || task.draft === true || task.completedAt) return null;
  if (typeof task.id !== "string" || !task.id) return null;
  const days = taskDays(task);
  // 日期与生命周期独立：显式 null 表示未安排，即使已有所属日也不提醒。
  // undefined 保留旧数据兼容（有日期即按旧口径视为已开始）。
  if (task.startedAt === null) return null;
  if (days.length === 0) return null;
  if (days[0] > day) return null; // 首个执行日在未来
  if (days.includes(day)) return "today";
  // 末日已过 = 欠账；夹在首末之间的空档日与状态机同口径计「今天」
  return days[days.length - 1] < day ? "overdue" : "today";
}

function reminderMessage(tasks, lang) {
  const zh = lang !== "en-US";
  const todayCount = tasks.filter((task) => task.kind === "today").length;
  const overdueCount = tasks.length - todayCount;
  const title = zh
    ? `今日提醒：${todayCount} 项进行中 · ${overdueCount} 项逾期`
    : `Task reminder: ${todayCount} in progress · ${overdueCount} overdue`;
  const names = tasks.slice(0, 3).map((task) => String(task.title || "").trim()).filter(Boolean);
  const body = names.join(zh ? "、" : ", ") + (tasks.length > 3
    ? zh ? ` 等 ${tasks.length} 项` : ` +${tasks.length - 3} more`
    : "");
  return { title, body };
}

// 当天提醒时刻之后才创建/改动的任务，当天不进提醒（2026-10 用户决策：新建/编辑的保存
// 反馈由应用内顶部 toast 承担，紧随其后的提醒弹窗构成「双弹」打扰——排到过去日期的新
// 任务一保存即成逾期，15s 内就会被本轮扫描捕获）。次日提醒恢复正常：跨日后时间戳自然
// 早于次日提醒时刻。时间戳取 updatedAt（缺失回落 createdAt，兼容历史数据/旧导出）。
function taskTouchedAfterReminderTime(task, day, fireAtMinutes) {
  const stamp = typeof task?.updatedAt === "string" && task.updatedAt
    ? task.updatedAt
    : typeof task?.createdAt === "string"
      ? task.createdAt
      : null;
  if (!stamp) return false;
  const stampMs = Date.parse(stamp);
  if (!Number.isFinite(stampMs)) return false;
  const [year, month, date] = String(day).split("-").map(Number);
  // 当日提醒时刻（本地时区），与 check 的 minute >= fireAt 同口径
  const fireMoment = new Date(year, month - 1, date, 0, fireAtMinutes);
  return stampMs > fireMoment.getTime();
}

function reminderPopupPosition(windowBounds, workArea, popupWidth, popupHeight) {
  const margin = 16;
  const desiredX = windowBounds
    ? windowBounds.x + windowBounds.width - popupWidth - margin
    : workArea.x + workArea.width - popupWidth - margin;
  const desiredY = windowBounds ? windowBounds.y + margin : workArea.y + margin;
  const minX = workArea.x + margin;
  const minY = workArea.y + margin;
  const maxX = Math.max(minX, workArea.x + workArea.width - popupWidth - margin);
  const maxY = Math.max(minY, workArea.y + workArea.height - popupHeight - margin);
  return {
    x: Math.max(minX, Math.min(desiredX, maxX)),
    y: Math.max(minY, Math.min(desiredY, maxY)),
  };
}

function createDesktopReminderEngine({ readSettings, readTasks, readLedger, writeLedger, deliver, now = () => new Date() }) {
  let interval = null;
  let checking = null;

  async function check() {
    if (checking) return checking;
    checking = (async () => {
      const settings = readSettings();
      if (settings?.reminderEnabled !== true) return false;
      const current = now();
      const day = localDayKey(current);
      const minute = current.getHours() * 60 + current.getMinutes();
      const fireAt = reminderMinutesOfDay(settings.reminderTime);
      if (minute < fireAt) return false;

      const ledger = readLedger();
      // 修改提醒时间代表一次新的设置；旧时间下的去重记录不能挡住新时间。
      const sent = new Set(ledger?.day === day && ledger?.fireAt === fireAt && Array.isArray(ledger.ids)
        ? ledger.ids
        : []);
      const due = (readTasks() || [])
        .map((task) => ({ ...task, kind: dueKind(task, day) }))
        .filter((task) => task.kind && !sent.has(task.id))
        .filter((task) => !taskTouchedAfterReminderTime(task, day, fireAt));
      if (due.length === 0) return false;

      const delivered = await deliver(reminderMessage(due, settings.language));
      if (!delivered) return false; // 投递失败时下轮继续尝试，不提前记为已提醒。
      for (const task of due) sent.add(task.id);
      writeLedger({ day, fireAt, ids: [...sent] });
      return true;
    })().catch((error) => {
      console.error("[reminder] check failed", error);
      return false;
    }).finally(() => { checking = null; });
    return checking;
  }

  function start() {
    if (interval) return;
    void check();
    interval = setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
  }

  function stop() {
    if (interval) clearInterval(interval);
    interval = null;
  }

  return { start, stop, check };
}

module.exports = {
  CHECK_INTERVAL_MS,
  localDayKey,
  reminderMinutesOfDay,
  dueKind,
  reminderMessage,
  reminderPopupPosition,
  taskTouchedAfterReminderTime,
  createDesktopReminderEngine,
};

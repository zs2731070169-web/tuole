// 消息中心入口（2026-10-18 提醒重构）：TopBar 设置按钮左边的铃铛按钮 + 未读红点 +
// Popover 消息列表小卡片。提醒不再弹窗/发声——每日首启摘要落进消息池，由用户主动查看；
// 打开卡片即全部标记已读（唯一已读路径），红点随之消散、当日不再提示。
// 摘要内任务整行可点击：按任务当前所属日跳转工作台并高亮；标题、状态与计数实时读取任务库。
import { useState } from "react";
import { Bell, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useMessageStore } from "../stores/useMessageStore";
import { useTaskStore } from "../stores/useTaskStore";
import { useUiStore } from "../stores/useUiStore";
import {
  DIGEST_TITLE_CAP,
  digestTaskTargetDay,
  syncDailyDigest,
  unreadMessageCount,
  type SyncedDigestTask,
} from "../shared/messages";
import { friendlyDate } from "../lib/date";
import { t } from "../lib/i18n";
import { computeAutoStatus, statusToneClass } from "../shared/statusMachine";
import type { AppMessage, TaskStatus, TaskView } from "../shared/types";

export function MessageCenter() {
  const lang = useSettingsStore((s) => s.settings.language);
  // messages 是 store 内稳定数组 state，可安全订阅；未读数在此纯派生（红点判定）
  const messages = useMessageStore((s) => s.messages);
  const tasks = useTaskStore((s) => s.tasks);
  // 不在 selector 里调用 views()（会每次返回新数组触发无限重渲染）；任务数组变化时组件自然重渲染，
  // 打开 Popover 也会重新按此刻时间派生状态，确保完成/改期/跨日后的消息展示是新的。
  const now = new Date();
  const taskViews: TaskView[] = tasks
    .filter((task) => task.draft !== true)
    .map((task) => ({ ...task, status: computeAutoStatus(task, { now }) }));
  const unread = unreadMessageCount(messages);
  const [open, setOpen] = useState(false);

  const ariaLabel =
    unread > 0
      ? `${t("messages.open", lang)} · ${t("messages.unread", lang).replace("{n}", String(unread))}`
      : t("messages.open", lang);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // 打开消息卡片 = 全部已读（含此刻未读的当日摘要；已读消息永久保留在列表里供回看）
        if (next) useMessageStore.getState().markAllRead();
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-label={ariaLabel}
          title={ariaLabel}
          className="relative grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="size-5" />
          {/* 未读红点：纯视觉指示，不拦截指针（点击始终落在按钮上） */}
          {unread > 0 && (
            <span aria-hidden className="pointer-events-none absolute right-2.5 top-2.5 size-2 rounded-full bg-destructive" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("messages.title", lang)}
        </div>
        {messages.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">{t("messages.empty", lang)}</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                taskViews={taskViews}
                lang={lang}
                onJump={() => setOpen(false)}
              />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** 点击摘要任务：按任务当前日期跳工作台并高亮；点击是导航，不消费/删除消息内容。 */
function jumpToDigestTask(message: AppMessage, ref: SyncedDigestTask): void {
  const task = useTaskStore.getState().tasks.find((item) => item.id === ref.taskId && item.draft !== true);
  if (!task) return;
  const ui = useUiStore.getState();
  // 不走 openDayInWorkbench（它会记 returnView="calendar"，而这里来源是顶栏消息中心而非日历）；
  // 手动 setView 会清空 returnView；任务若已改期，锚点跟随当前首日，确保跳转后卡片真实可见。
  ui.setView("workbench");
  ui.setWorkbenchDay(digestTaskTargetDay(task, message.dayKey));
  // 程序化「高亮这张卡」：先清再选，绕开 select 对「唯一选中再点 = 取消」的翻转语义
  ui.clearHighlight();
  ui.select(ref.taskId);
}

// 单条消息：日期标签（今天/昨天/绝对日期——消息日期是真实时间框架，相对词语义正确）
// + 实时计数摘要 + 整行可点击任务（标题/状态/跳转日期均跟随当前任务库）
function MessageRow({
  message,
  taskViews,
  lang,
  onJump,
}: {
  message: AppMessage;
  taskViews: TaskView[];
  lang: "zh-CN" | "en-US";
  onJump: () => void;
}) {
  const synced = syncDailyDigest(message.digest, taskViews);
  const visibleTasks = synced.tasks.slice(0, DIGEST_TITLE_CAP);
  const hiddenCount = Math.max(0, synced.tasks.length - visibleTasks.length) + synced.legacyHiddenCount;

  return (
    <li className="px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{friendlyDate(message.dayKey, lang)}</div>
      <div className="mt-0.5 text-[13px] font-medium">
        {t("messages.summary", lang)
          .replace("{today}", String(synced.todayCount))
          .replace("{overdue}", String(synced.overdueCount))}
      </div>
      {visibleTasks.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {visibleTasks.map((ref) => (
            <li key={ref.taskId}>
              <DigestTaskRow
                message={message}
                task={ref}
                lang={lang}
                onJump={onJump}
              />
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="px-1.5 text-[12px] text-muted-foreground">
              {t("messages.more", lang).replace("{n}", String(hiddenCount))}
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** 整行都是同一个点击目标：标题、状态 chip、行内留白与箭头均可触发，键盘只停一次。 */
function DigestTaskRow({
  message,
  task,
  lang,
  onJump,
}: {
  message: AppMessage;
  task: SyncedDigestTask;
  lang: "zh-CN" | "en-US";
  onJump: () => void;
}) {
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
          task.status === "deleted" ? "bg-muted text-muted-foreground" : statusToneClass(task.status),
        )}
      >
        {messageTaskStatusLabel(task.status, lang)}
      </span>
      {task.status !== "deleted" && <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-45" />}
    </>
  );

  if (task.status === "deleted") {
    return (
      <div className="flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] text-muted-foreground/70">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        jumpToDigestTask(message, task);
        onJump();
      }}
      title={`${task.title} · ${messageTaskStatusLabel(task.status, lang)}`}
      className="flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
    >
      {content}
    </button>
  );
}

function messageTaskStatusLabel(status: TaskStatus | "deleted", lang: "zh-CN" | "en-US"): string {
  const key = `messages.status.${status}` as const;
  return t(key, lang);
}

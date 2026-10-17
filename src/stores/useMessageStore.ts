// 消息 store（2026-10-18 提醒重构）：每日首启摘要的消息池，独立实体、独立持久化。
// 不参与任务的状态机/筛选/统计/Excel/备份任何链路；摘要聚合口径见 shared/messages.ts。
// 无弹窗投递：消息只进池（未读红点）+ 消息中心查看，打开卡片即全部已读。
import { create } from "zustand";
import type { AppMessage } from "../shared/types";
import { loadMessages, saveMessages } from "../lib/storage";
import { todayKey } from "../lib/date";
import { MAX_MESSAGES, buildDailyDigest, buildDigestMessage } from "../shared/messages";
import { useTaskStore } from "./useTaskStore";
import { useSettingsStore } from "./useSettingsStore";

interface MessageState {
  messages: AppMessage[];
  init: () => void;
  persist: () => void;
  /** 每日摘要生成（幂等，重复调用安全）：开关关闭 / 当天已有消息 / 当天聚合为空 → 零副作用。
   *  生成时机 = App 启动、reminderEnabled 切换为开、scheduler 跨午夜/可见性日变更 */
  ensureDailyDigest: (dayKey?: string) => boolean;
  /** 打开消息卡片即全部标记已读（唯一已读路径，红点随之消散） */
  markAllRead: () => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  init: () => set({ messages: loadMessages() }),
  persist: () => saveMessages(get().messages),
  // 跨 store 单向读取（useMessageStore → useTaskStore/useSettingsStore，无环）：
  // 摘要成员在启动/开关/跨日时刻定格；状态、标题与计数由 MessageCenter 对当前任务库实时派生
  ensureDailyDigest: (day = todayKey()) => {
    const settings = useSettingsStore.getState().settings;
    if (!settings.reminderEnabled) return false;
    // 当天已生成（无论已读未读）都不再补——已读摘要当日重启不再提示的口径落点
    if (get().messages.some((message) => message.dayKey === day)) return false;
    const digest = buildDailyDigest(useTaskStore.getState().views());
    if (!digest) return false; // 当天无事可报：不落空摘要消息
    const message = buildDigestMessage(day, digest, new Date().toISOString());
    // 前插（新→旧）+ 滚动保留最近 MAX_MESSAGES 条
    set({ messages: [message, ...get().messages].slice(0, MAX_MESSAGES) });
    get().persist();
    return true;
  },
  markAllRead: () => {
    if (!get().messages.some((message) => message.readAt === null)) return;
    const readAt = new Date().toISOString();
    set({
      messages: get().messages.map((message) => (message.readAt === null ? { ...message, readAt } : message)),
    });
    get().persist();
  },
}));

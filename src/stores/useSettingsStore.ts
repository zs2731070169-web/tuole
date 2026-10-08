// 设置 store：主题、语言、状态机规则开关、提醒等；持久化到 localStorage
import { create } from "zustand";
import type { Settings, ThemeMode } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import { loadSettings, saveSettings } from "../lib/storage";
import { applyTheme, watchSystemTheme } from "../lib/theme";

interface SettingsState {
  settings: Settings;
  init: () => void;
  setTheme: (m: ThemeMode) => void;
  setLanguage: (l: Settings["language"]) => void;
  patch: (p: Partial<Settings>) => void;
}

let cleanup: (() => void) | null = null;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  init: () => {
    const settings = loadSettings();
    applyTheme(settings.theme);
    set({ settings });
    // 跟随系统时监听 OS 变化
    if (cleanup) cleanup();
    cleanup = watchSystemTheme((t) => {
      if (get().settings.theme === "system") applyTheme(t);
    });
  },
  setTheme: (m) => {
    applyTheme(m);
    const settings = { ...get().settings, theme: m };
    saveSettings(settings);
    set({ settings });
  },
  setLanguage: (l) => {
    const settings = { ...get().settings, language: l };
    saveSettings(settings);
    set({ settings });
  },
  patch: (p) => {
    const settings = { ...get().settings, ...p };
    saveSettings(settings);
    set({ settings });
    if (p.theme) applyTheme(p.theme);
  },
}));

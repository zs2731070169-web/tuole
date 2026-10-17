// 顶部栏：品牌、视图切换（概览/日历/工作台/备忘）、消息中心、设置入口——只放全局通用项；
// 搜索 / 组合筛选 / Excel 导入导出在 ViewToolbar（各模块内容区工具行），不在这里。
// 新建走 ViewToolbar 的「新建」按钮。
import { Settings2, LayoutDashboard, CalendarDays, Layers, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "../shared/types";
import { useUiStore } from "../stores/useUiStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { APP_NAME } from "../shared/constants";
import { isDesktopApp } from "../lib/desktopBridge";
import { MessageCenter } from "./MessageCenter";

const VIEWS: { key: ViewMode; zh: string; en: string; Icon: typeof LayoutDashboard }[] = [
  { key: "all", zh: "概览", en: "Overview", Icon: Layers },
  { key: "calendar", zh: "日历", en: "Calendar", Icon: CalendarDays },
  { key: "workbench", zh: "工作台", en: "Workbench", Icon: LayoutDashboard },
  { key: "notes", zh: "备忘", en: "Notes", Icon: StickyNote },
];

export function TopBar() {
  const lang = useSettingsStore((s) => s.settings.language);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  // 桌面端文件面板切换时避免透明层/模糊层参与窗口重采样，顶栏使用不透明背景保持稳定。
  return (
    <header className={cn("sticky top-0 z-30 border-b bg-background", isDesktopApp && "desktop-titlebar")}>
      {/* 内层与 main 同宽（全宽自适应、勿写死上限）：品牌/视图切换锚定真左、设置锚定真右，与内容区两缘对齐 */}
      <div className={cn("flex w-full items-center gap-2 px-4 py-3 sm:gap-3", isDesktopApp && "desktop-titlebar-inner")}>
        <div className="mr-1 hidden shrink-0 items-center gap-2 sm:flex">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">妥</span>
          <span className="text-[14px] font-semibold tracking-tight">{APP_NAME}</span>
        </div>

        {/* 视图切换：加大尺寸（图标 18px / 字号 13px），与右侧 44px 设置按钮的视觉量级匹配 */}
        <nav className="inline-flex shrink-0 rounded-xl bg-muted p-1" aria-label="view">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors",
                view === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <v.Icon className="size-4.5" />
              <span className="hidden md:inline">{lang === "zh-CN" ? v.zh : v.en}</span>
            </button>
          ))}
        </nav>

        {/* 搜索/筛选/Excel 已移至各模块内容区的 ViewToolbar；消息中心 + 设置按钮靠右。
            消息中心（2026-10-18 提醒重构）在设置按钮左边：未读红点提示、点击弹出消息卡片；
            size-11（44px）达标触控热区，图标 size-5 放大便于辨认点击 */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <MessageCenter />
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="settings"
            title="settings"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings2 className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

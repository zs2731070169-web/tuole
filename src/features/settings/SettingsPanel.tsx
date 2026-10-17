// 设置页：主题 / 语言 / 状态机规则（顺延目标）/ 提醒（2026-10-18 重构：每日首启摘要 + 消息中心）
// 红线：不提供「逾期自动完成」开关（原「交互红线」提示文案已按需求从界面移除，仅保留代码注释约束）
import { useRef, useState } from "react";
import { X, Sun, Moon, Monitor, ChevronDown, Archive, Download, RotateCcw, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ThemeMode, RollOverTarget } from "../../shared/types";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useMessageStore } from "../../stores/useMessageStore";
import { useUiStore } from "../../stores/useUiStore";
import { useConfirmStore } from "../../stores/useConfirmStore";
import { t } from "../../lib/i18n";
import { APP_NAME } from "../../shared/constants";
import {
  listBackups,
  restoreFromBackup,
  exportBackupToFile,
  parseBackupFile,
  replaceTasksWithRecoveryPoint,
  flushDesktopBackupSync,
} from "../../services/backup";
import { isDesktopApp, openDesktopBackupDirectory, openDesktopFile } from "../../lib/desktopBridge";
import type { TaskBackup } from "../../lib/storage";

export function SettingsPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const close = () => useUiStore.getState().setSettingsOpen(false);
  const lang = settings.language;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* 纯色遮罩即可建立层级；勿加全屏 backdrop-blur，原生文件面板退出时会触发整页重采样并造成顿挫 */}
      <div className="absolute inset-0 bg-black/30" onClick={close} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">{t("action.settings", lang)}</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">{APP_NAME}</span>
          <button onClick={close} className="grid size-8 place-items-center rounded-lg hover:bg-muted">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* 主题 */}
          <Section title={t("settings.theme", lang)}>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["system", Monitor],
                  ["light", Sun],
                  ["dark", Moon],
                ] as [ThemeMode, typeof Sun][]
              ).map(([mode, Icon]) => (
                <button
                  key={mode}
                  onClick={() => setTheme(mode)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border py-3 text-[12px] transition-colors",
                    settings.theme === mode ? "border-primary bg-primary/[0.06] text-primary" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {mode === "system" ? t("settings.themeSystem", lang) : mode === "light" ? t("settings.themeLight", lang) : t("settings.themeDark", lang)}
                </button>
              ))}
            </div>
          </Section>

          {/* 语言 */}
          <Section title={t("settings.language", lang)}>
            <div className="inline-flex rounded-lg bg-muted p-0.5">
              {(["zh-CN", "en-US"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                    lang === l ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {l === "zh-CN" ? "中文" : "English"}
                </button>
              ))}
            </div>
          </Section>

          {/* 状态机规则 */}
          <Section title={lang === "zh-CN" ? "状态机规则" : "Status rules"}>
            <div className="space-y-3">
              {/* 顺延目标：使用组件库 Select，保持与本区其他设置项一致的交互与样式。 */}
              <div className="flex items-center justify-between text-[13px]">
                <span>{t("settings.rollOverTarget", lang)}</span>
                <Select
                  value={settings.rollOverTarget}
                  onValueChange={(value) => patch({ rollOverTarget: value as RollOverTarget })}
                >
                  <SelectTrigger className="h-8 w-32 rounded-lg text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tomorrow">{t("settings.rollTomorrow", lang)}</SelectItem>
                    <SelectItem value="nextWeekday">{t("settings.rollWeekday", lang)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* 提醒（2026-10-18 重构）：固定时间提醒 → 每日首启摘要，右上角消息中心查看 */}
          <Section title={t("settings.reminder", lang)}>
            <ToggleRow
              label={t("settings.reminderToggle", lang)}
              checked={settings.reminderEnabled}
              onChange={(enabled) => {
                patch({ reminderEnabled: enabled });
                // 开启即生成当日摘要（幂等）：当场在右上角消息中心可见，无需独立测试入口
                if (enabled) useMessageStore.getState().ensureDailyDigest();
              }}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {t("settings.reminderHint", lang)}
            </p>
          </Section>

          {/* 备份与恢复：自动备份间隔只在开启时显示；导出/恢复与快照列表始终可用 */}
          <Section title={t("settings.backup", lang)}>
            <ToggleRow
              label={t("settings.backupToggle", lang)}
              checked={settings.autoBackupEnabled}
              onChange={(v) => patch({ autoBackupEnabled: v })}
            />
            {settings.autoBackupEnabled && (
              <div className="mt-3 flex items-center justify-between text-[13px]">
                <span>{t("settings.backupInterval", lang)}</span>
                <Select
                  value={String(settings.autoBackupIntervalMinutes)}
                  onValueChange={(v) => patch({ autoBackupIntervalMinutes: Number(v) })}
                >
                  <SelectTrigger className="h-8 w-32 rounded-lg text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 15, 30, 60, 360, 1440].map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {backupIntervalLabel(minutes, lang === "zh-CN")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <BackupActions />
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {isDesktopApp
                ? t("backup.desktopHint", lang)
                : lang === "zh-CN"
                  ? "快照保存在应用内并滚动保留最近 10 份；替换导入或恢复前会自动保存当前任务。「导出」可将最新快照下载为 JSON 文件，避免浏览器数据被清除后无法恢复。"
                  : "Snapshots stay in-app, keeping the latest 10; current tasks are saved automatically before a replace or restore. Export downloads the latest snapshot as JSON so it remains available if browser data is cleared."}
            </p>
          </Section>

        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span>{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className={cn(
          "h-6 w-11 border-none data-[state=checked]:bg-status-today data-[state=unchecked]:bg-input",
          "[&>span]:h-5 [&>span]:w-5 [&>span]:bg-white [&>span]:shadow-sm [&>span]:ring-0 data-[state=checked]:[&>span]:translate-x-[22px] data-[state=unchecked]:[&>span]:translate-x-0.5",
        )}
      />
    </div>
  );
}

// 备份间隔选项的人性化标签：60 -> 1 小时、1440 -> 每天，其余按分钟
function backupIntervalLabel(minutes: number, zh: boolean): string {
  if (minutes === 1440) return zh ? "每天" : "Daily";
  if (minutes === 360) return zh ? "6 小时" : "6 hours";
  if (minutes === 60) return zh ? "1 小时" : "1 hour";
  return zh ? `${minutes} 分钟` : `${minutes} min`;
}

// 备份快照时间标签：zh「10月7日 18:32」/ en「Oct 7, 18:32」
function formatBackupTime(iso: string, zh: boolean): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return zh ? `${d.getMonth() + 1}月${d.getDate()}日 ${hm}` : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${hm}`;
}

// 备份操作区：导出最新 JSON / 从文件恢复 + 快照列表（逐条恢复）
function BackupActions() {
  const lang = useSettingsStore((s) => s.settings.language);
  const zh = lang === "zh-CN";
  const [backups, setBackups] = useState<TaskBackup[]>(() => listBackups());
  const [historyOpen, setHistoryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const refresh = () => setBackups(listBackups());

  const restoreWithConfirm = async (label: string, taskCount: number, apply: () => void) => {
    const confirmed = await useConfirmStore.getState().ask(
      zh
        ? `用 ${label} 的备份（${taskCount} 项）替换当前全部任务？恢复前会自动保存当前任务。`
        : `Replace all current tasks with the backup ${label} (${taskCount} tasks)? Current tasks will be saved first.`,
      { confirmLabel: t("backup.restore", lang), tone: "accent" },
    );
    if (!confirmed) return;
    apply();
    refresh();
    toast.success(t("toast.restored", lang));
  };

  const importBackupText = async (raw: string) => {
    const tasks = parseBackupFile(raw);
    if (!tasks) {
      toast.error(t("backup.importFailed", lang));
      return;
    }
    await restoreWithConfirm(t("backup.importFile", lang), tasks.length, () => {
      replaceTasksWithRecoveryPoint(tasks);
    });
  };

  const openBackupImport = async () => {
    if (!isDesktopApp) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const opened = await openDesktopFile({
        title: t("backup.importFile", lang),
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (opened?.data) await importBackupText(new TextDecoder().decode(opened.data));
    } catch {
      toast.error(t("backup.importFailed", lang));
    }
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            const latest = listBackups()[0];
            if (!latest) {
              toast(t("backup.noneToExport", lang));
              return;
            }
            void exportBackupToFile(latest).catch(() => toast.error(t("backup.importFailed", lang)));
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted active:scale-95"
        >
          <Download className="size-3.5" />
          {t("backup.export", lang)}
        </button>
        <button
          onClick={openBackupImport}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted active:scale-95"
        >
          <RotateCcw className="size-3.5" />
          {t("backup.importFile", lang)}
        </button>
        {isDesktopApp && (
          <button
            onClick={async () => {
              await flushDesktopBackupSync();
              const result = await openDesktopBackupDirectory();
              if (!result) return;
              if (result.ok) {
                toast.success(t("backup.directoryOpened", lang));
              } else {
                toast.error(t("backup.directoryOpenFailed", lang).replace("{path}", result.path ?? ""));
              }
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted active:scale-95"
          >
            <FolderOpen className="size-3.5" />
            {t("backup.openDirectory", lang)}
          </button>
        )}
        {/* 隐藏文件入口：解析成功并确认后以 replace 模式全量恢复 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // 允许重复选择同一文件
            if (!file) return;
            try {
              await importBackupText(await file.text());
            } catch {
              toast.error(t("backup.importFailed", lang));
            }
          }}
        />
      </div>

      {backups.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted-foreground">{t("backup.empty", lang)}</p>
      ) : (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t("backup.latest", lang)}</p>
          <ul>
            <BackupRow backup={backups[0]} zh={zh} onRestore={restoreWithConfirm} />
          </ul>

          {backups.length > 1 && (
            <>
              <button
                type="button"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((open) => !open)}
                className="mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                {historyOpen
                  ? t("backup.hideOlder", lang)
                  : t("backup.showOlder", lang).replace("{n}", String(backups.length - 1))}
                <ChevronDown className={cn("size-3.5 transition-transform", historyOpen && "rotate-180")} />
              </button>
              {historyOpen && (
                <ul className="mt-1.5 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {backups.slice(1).map((backup) => (
                    <BackupRow
                      key={backup.id}
                      backup={backup}
                      zh={zh}
                      onRestore={restoreWithConfirm}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BackupRow({
  backup,
  zh,
  onRestore,
}: {
  backup: TaskBackup;
  zh: boolean;
  onRestore: (label: string, taskCount: number, apply: () => void) => Promise<void>;
}) {
  const lang = zh ? "zh-CN" : "en-US";
  const label = formatBackupTime(backup.createdAt, zh);

  return (
    <li className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[12px]">
      <Archive className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {label} · {backup.taskCount} {zh ? "项" : "tasks"}
      </span>
      <button
        onClick={() => void onRestore(label, backup.taskCount, () => restoreFromBackup(backup))}
        className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {t("backup.restore", lang)}
      </button>
    </li>
  );
}

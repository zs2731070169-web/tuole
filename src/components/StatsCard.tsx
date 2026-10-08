// 任务统计概览卡片（纯只读，仅「全部」视图渲染）：总体完成进度 + 全部 / 逾期 / 进行中 / 本周完成 / 近30天完成
// 红线：这里只做数字展示，不承载任何筛选交互 —— 切换查看视角统一交给状态筛选栏
// 今日口径不在本卡：今日完成进度展示在 WorkbenchView 顶部条
// 数据口径全部来自 shared/overviewStats（唯一真相源），本组件零内联计算
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { OverviewStats } from "../shared/overviewStats";
import { useSettingsStore } from "../stores/useSettingsStore";
import { t } from "../lib/i18n";
import { fromDateKey, todayKey } from "../lib/date";

interface Props {
  stats: OverviewStats;
}

export function StatsCard({ stats }: Props) {
  const lang = useSettingsStore((s) => s.settings.language);

  const rate = stats.total === 0 ? null : Math.round((stats.totalDone / stats.total) * 100);

  return (
    <section
      aria-label={t("stats.title", lang)}
      // 勿加 backdrop-blur：卡片位于固定不透明背景之上，模糊无视觉收益，
      // 却会让 reveal 入场动画期间每帧重采样合成层，首次渲染明显掉帧（已实测修复）
      className="mb-4 overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-[0_1px_0_0_var(--border)_inset,0_12px_28px_-18px_oklch(0.2_0.04_265/0.35)]"
    >
      {/* 顶部：标题 + 总体完成进度（刻意不放当天日期——无信息量）；
          右侧进度块横向单行排列（2026-10 用户决策：竖排三行太占头部高度），与标题垂直居中 */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border/60 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
            {t("stats.title", lang)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Ring value={rate} label={lang === "zh-CN" ? "总体" : "Total"} />
          {/* 标签 + 百分比 + 进度条 一行放下；仅无任务 / 全部完成时在行尾追加状态短句 */}
          <div className="hidden items-center gap-2.5 sm:flex">
            <span className="whitespace-nowrap text-[11px] text-muted-foreground">
              {t("stats.totalProgress", lang)}
            </span>
            {/* 只按百分比展示，不给数量口径 */}
            <span className="text-[15px] font-semibold leading-none tabular-nums text-foreground">
              {rate === null ? "—" : `${rate}%`}
            </span>
            <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-status-today transition-[width] duration-500 ease-out"
                style={{ width: `${rate ?? 0}%` }}
              />
            </div>
            {(stats.total === 0 || rate === 100) && (
              <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                {stats.total === 0 ? t("stats.noTasks", lang) : t("stats.allDone", lang)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 指标区：六个**独立单元卡**（2026-10 用户决策：勿连体——原 hairline 分格已拆，
          每格独立边框/圆角、gap 分隔；格间水平与高度对齐由 grid 默认拉伸保证，勿改 items-start）。
          纯展示，不提供筛选交互（全部/逾期/进行中/未安排/本周完成/近30天完成；
          数值下不放小字说明/拆解副行，标签 + 数值即全部） */}
      <div className="px-4 pb-1 pt-3 sm:px-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label={t("metric.all", lang)} value={stats.total} tone="neutral" />
          <Metric
            label={t("metric.overdue", lang)}
            value={stats.overdue}
            tone="overdue"
            emphasis={stats.overdue > 0}
          />
          <Metric label={t("metric.active", lang)} value={stats.active} tone="today" />
          <Metric label={t("metric.unscheduled", lang)} value={stats.unscheduled} tone="neutral" />
          <Metric label={t("metric.weekDone", lang)} value={stats.weekCompleted} tone="done" />
          <Metric label={t("metric.monthDone", lang)} value={stats.monthCompleted} tone="done" />
        </div>
      </div>

      {/* 近 30 天完成节奏 */}
      <div className="px-4 pb-3.5 pt-3 sm:px-5">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">{t("stats.trend", lang)}</p>
        <div className="flex h-20 items-end gap-[3px]" role="img" aria-label={t("stats.trend", lang)}>
          {/* 组件级气泡（勿改回原生 title：系统气泡有约 1s 延迟且样式不可控）；
              delayDuration=0 悬停立即显示；disableHoverableContent 关闭 Radix 的 grace-area
              机制——默认模式下气泡与柱子围成的凸包会罩住相邻柱顶部，柱间移动时旧气泡
              粘连不关、新气泡被 isPointerInTransitRef 拦截不开（30 根密集柱场景必现） */}
          <TooltipProvider delayDuration={0} disableHoverableContent>
            {stats.daily.map((n, i) =>
              // 气泡只挂「有完成记录」的柱子（2026-10 用户决策）：空日期若也弹「无完成记录」，
              // 扫过整排空白柱时连环弹出即是噪音；无柱日期只渲染静态占位柱
              n > 0 ? (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    {/* 全高命中区（命中区必须大于标记本身：柱高随数据量变化，矮柱直接作热区难以命中）；
                        tabIndex=-1 —— 卡片 role="img" 纯只读，勿让柱子挤进 Tab 序 */}
                    <span className="group/bar flex h-full flex-1 items-end" tabIndex={-1}>
                      <span
                        className={cn(
                          // 仅过渡 height（30 根柱子用 transition-all 会在任意类变化时全量插值，勿改回）；
                          // 悬停抬亮挂在 group-hover 上：指针落在全高命中区的任何位置柱子都会响应
                          "w-full rounded-[2px] bg-status-done/70 transition-[height] duration-300 group-hover/bar:bg-status-done",
                          // 今天的柱子实心 + 描环突出（进入本分支即已保证 n>0）
                          i === 29 && "bg-status-done ring-1 ring-status-done/40",
                        )}
                        style={{ height: `${Math.max(14, (n / stats.peak) * 100)}%` }}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6} className="px-2.5 py-1.5">
                    {/* 日期弱化为小字，完成数才是气泡的主视觉 */}
                    <p className="text-[10px] leading-tight text-primary-foreground/65">
                      {barDateLabel(stats.dailyKeys[i], lang)}
                    </p>
                    <p className="text-xs font-semibold leading-tight tabular-nums">{barValueLabel(n, lang)}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                // 无完成记录的占位柱：无气泡、也不做悬停反馈（有反馈反而暗示可交互）
                <span
                  key={i}
                  className="flex-1 rounded-[2px] bg-muted-foreground/12 transition-[height] duration-300"
                  style={{ height: "8%" }}
                />
              ),
            )}
          </TooltipProvider>
        </div>
      </div>
    </section>
  );
}

// 单个指标单元卡：独立边框/圆角（2026-10 用户决策：六格隔离为独立单元，不连体）；
// h-full + grid 默认拉伸 = 同行等高、跨列水平对齐。纯展示，只有「标签 + 数值」，不放小字说明/拆解副行
function Metric(props: {
  label: string;
  value: number;
  tone: "neutral" | "overdue" | "today" | "done";
  emphasis?: boolean;
}) {
  const bar = {
    neutral: "bg-muted-foreground/40",
    overdue: "bg-status-overdue",
    today: "bg-status-today",
    done: "bg-status-done",
  }[props.tone];

  return (
    <div className="group relative flex h-full flex-col items-start gap-0.5 rounded-xl border border-border/60 bg-card px-3.5 py-3 text-left">
      <span
        className={cn(
          "absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[2px] rounded-full",
          bar,
          props.emphasis ? "opacity-100" : "opacity-60",
        )}
      />
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {props.label}
        {props.emphasis && <span className="size-1.5 animate-pulse rounded-full bg-status-overdue" />}
      </span>
      <span
        className={cn(
          "text-[26px] font-semibold leading-none tabular-nums tracking-tight",
          props.emphasis ? "text-status-overdue" : "text-foreground",
        )}
      >
        {props.value}
      </span>
    </div>
  );
}

// 总体完成率环形指示（SVG 纯装饰，无交互）
function Ring({ value, label }: { value: number | null; label: string }) {
  const pct = value ?? 0;
  const r = 21;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-[52px] shrink-0 sm:hidden">
      <svg viewBox="0 0 52 52" className="-rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          className="stroke-status-today transition-[stroke-dasharray] duration-500 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">
        {value === null ? "—" : `${pct}%`}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

// 柱状图气泡文案（组件 Tooltip 双行结构）：日期行弱化、数值行加粗，明确说明「哪一天 · 完成了几项」
function barDateLabel(dayKey: string, lang: "zh-CN" | "en-US"): string {
  const d = fromDateKey(dayKey);
  const suffix = dayKey === todayKey() ? (lang === "zh-CN" ? "（今天）" : " (today)") : "";
  return lang === "zh-CN"
    ? `${d.getMonth() + 1}月${d.getDate()}日${suffix}`
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + suffix;
}

// 柱状图气泡数值文案（渲染门控保证只有 n>0 的柱子才出气泡，无需零值分支）
function barValueLabel(n: number, lang: "zh-CN" | "en-US"): string {
  return lang === "zh-CN" ? `完成 ${n} 项` : `${n} completed`;
}

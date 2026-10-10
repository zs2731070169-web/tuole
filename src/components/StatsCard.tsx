// 任务统计概览卡片（纯只读，仅「全部」视图渲染）：总体完成进度（独立圆环卡）+ 五格指标。
// 红线：这里只做数字展示，不承载任何筛选交互 —— 切换查看视角统一交给状态筛选栏。
// 今日口径不在本卡：今日完成进度展示在 WorkbenchView 顶部条。
// 近 30 天节奏图已于 2026-10-10 随用户决策下线（勿加回）；时间投入图表在洞察面板（InsightsPanel）。
// 数据口径全部来自 shared/overviewStats（唯一真相源），本组件零内联计算。
import { cn } from "@/lib/utils";
import type { OverviewStats } from "../shared/overviewStats";
import { useSettingsStore } from "../stores/useSettingsStore";
import { t } from "../lib/i18n";

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
      <div className="px-4 pt-4 sm:px-5">
        <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {t("stats.title", lang)}
        </p>
      </div>

      {/* 指标区：总体进度独立圆环卡（2026-10-10 用户决策：拆出独立卡片 + 圆环进度条）+
          五个**独立单元卡**（2026-10-11 用户决策：「本周完成」与「近 30 天完成」下线，保留「已完成」总数；
          每格独立边框/圆角、gap 分隔；
          格间水平与高度对齐由 grid 默认拉伸保证，勿改 items-start）。lg 起同排、窄屏堆叠。
          纯展示，不提供筛选交互；数值下不放小字说明/拆解副行，标签 + 数值即全部 */}
      <div className="flex flex-col gap-2 px-4 pb-4 pt-3 sm:px-5 lg:flex-row lg:items-stretch">
        <ProgressCard rate={rate} total={stats.total} lang={lang} />
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
          <Metric label={t("metric.all", lang)} value={stats.total} tone="neutral" />
          <Metric
            label={t("metric.overdue", lang)}
            value={stats.overdue}
            tone="overdue"
            emphasis={stats.overdue > 0}
          />
          <Metric label={t("metric.active", lang)} value={stats.active} tone="today" />
          <Metric label={t("metric.unscheduled", lang)} value={stats.unscheduled} tone="neutral" />
          <Metric label={t("metric.completed", lang)} value={stats.totalDone} tone="done" />
        </div>
      </div>
    </section>
  );
}

// 总体完成进度独立卡：SVG 圆环（画法迁移自被删的按期完成率环形）+ 中心百分比 + 状态短句。
// 只按百分比展示、不给数量口径（既有决策不变）；无任务 / 全部完成时追加状态短句
function ProgressCard({ rate, total, lang }: { rate: number | null; total: number; lang: "zh-CN" | "en-US" }) {
  const pct = rate ?? 0;
  return (
    <div className="flex shrink-0 items-center gap-4 rounded-xl border border-border/60 bg-card px-4 py-3 lg:w-72">
      {/* 环形（SVG 纯装饰，无交互）：fill status-today、track muted。
          viewBox 与显示尺寸 1:1（96）、半径 41 / 描边 9 取整像素 + svg 属性级旋转（矢量内变换）——
          良好实践但非锯齿根因：2026-10「圆环毛边锯齿」多轮排查最终确认为用户屏幕问题（曾试纯 CSS
          conic-gradient 方案后按用户要求还原 SVG，勿反复） */}
      <div className="relative size-24 shrink-0">
        <svg viewBox="0 0 96 96" className="size-24" shapeRendering="geometricPrecision">
          <circle cx="48" cy="48" r="41" fill="none" strokeWidth="9" className="stroke-muted" transform="rotate(-90 48 48)" />
          <circle
            cx="48"
            cy="48"
            r="41"
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 2 * Math.PI * 41} ${2 * Math.PI * 41}`}
            className="stroke-status-today transition-[stroke-dasharray] duration-500 ease-out"
            transform="rotate(-90 48 48)"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-foreground">
          {rate === null ? "—" : `${pct}%`}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{t("stats.totalProgress", lang)}</p>
        {(total === 0 || rate === 100) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {total === 0 ? t("stats.noTasks", lang) : t("stats.allDone", lang)}
          </p>
        )}
      </div>
    </div>
  );
}

// 单个指标单元卡：独立边框/圆角，不连体；
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

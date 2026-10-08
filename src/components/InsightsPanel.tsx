// 概览洞察面板（纯只读，滚动流渲染，仅「全部」视图）：**六个指标块各自独立成卡**（2026-10 用户决策：
// 3 组卡再拆到块级，组标题与面板「洞察」可见标题一并移除——aria-label 留给读屏）——
// 按期完成率 / 本周环比 / 逾期账龄 / 未结优先级分布 / 未来 7 天负载 / 近30天新建 vs 完成。
// 红线与 StatsCard 相同：零筛选交互（分段条、图表均不可点选）。
// 图表色彩已经 dataviz 校验器验证：
// - 逾期账龄 = status-overdue/55·78·100 单色相 ordinal 阶（明暗双模全项 PASS）；
// - 双柱弱化档 status-done/55、负载柱 status-today/70 浅色端对比 <3:1 —— 均以直接数值标签为 relief 通道；
// - 文本一律文本 token（数据色只上 mark，唯一例外是带方向的增量数字，走 stat-tile delta 惯例）。
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { OverviewStats } from "../shared/overviewStats";
import { useSettingsStore } from "../stores/useSettingsStore";
import { t } from "../lib/i18n";
import { fromDateKey, todayKey } from "../lib/date";

interface Props {
  stats: OverviewStats;
}

// 各指标卡的共同外壳：独立边框/圆角/阴影（与 StatsCard 同款；同样勿加 backdrop-blur——
// 卡片在不透明背景上，模糊只剩合成开销）+ 左侧 2px 语义色条与标签行。
// 内容区 flex-1 + 垂直居中：同行等高拉伸时矮卡的留白均分到上下，不再堆在底部
function Block(props: { label: string; tone: string; children: ReactNode }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/85 px-4 py-3.5 shadow-[0_1px_0_0_var(--border)_inset,0_12px_28px_-18px_oklch(0.2_0.04_265/0.35)]">
      <span className={cn("absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[2px] rounded-full opacity-60", props.tone)} />
      <p className="mb-1 text-xs font-medium text-muted-foreground">{props.label}</p>
      <div className="flex min-h-0 flex-1 flex-col justify-center">{props.children}</div>
    </div>
  );
}

export function InsightsPanel({ stats }: Props) {
  const lang = useSettingsStore((s) => s.settings.language);

  return (
    // 六卡网格：同行等高、列缘对齐（grid 默认拉伸 + h-full）；窄屏单列、中屏两列、宽屏三列
    <section
      aria-label={t("insight.title", lang)}
      className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
    >
      <OnTimeBlock stats={stats} lang={lang} />
      <WeekCompareBlock stats={stats} lang={lang} />
      <BacklogBlock stats={stats} lang={lang} />
      <PriorityMixBlock stats={stats} lang={lang} />
      <LoadBlock stats={stats} lang={lang} />
      <FlowBlock stats={stats} lang={lang} />
    </section>
  );
}

/* —— 按期完成率：环形 + 副行 —— */
function OnTimeBlock({ stats, lang }: BlockProps) {
  const rate = stats.onTimeRate;
  return (
    <Block label={t("insight.onTimeRate", lang)} tone="bg-status-done">
      {/* 环形 + 说明整组水平居中：矮文时左右留白均衡，不堆积在右侧 */}
      <div className="flex items-center justify-center gap-4">
        <OnTimeRing value={rate} />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("insight.onTimeSub", lang).replace("{on}", String(stats.onTimeCount)).replace("{of}", String(stats.onTimeJudged))}
        </p>
      </div>
    </Block>
  );
}

// 环形（SVG 纯装饰）：fill status-done、track muted（与总体进度条同语言）；中心百分比用比例数字（勿 tabular-nums）。
// viewBox 与显示尺寸 1:1（144）、半径 62 / 描边 12 取整像素 + svg 属性级旋转（矢量内变换）——
// 良好实践但非锯齿根因：2026-10「圆环毛边锯齿」多轮排查最终确认为用户屏幕问题（曾试纯 CSS
// conic-gradient 方案后按用户要求还原 SVG，勿反复）
function OnTimeRing({ value }: { value: number | null }) {
  const pct = value ?? 0;
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 144 144" className="size-36" shapeRendering="geometricPrecision">
        <circle cx="72" cy="72" r={radius} fill="none" strokeWidth="12" className="stroke-muted" transform="rotate(-90 72 72)" />
        <circle
          cx="72"
          cy="72"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
          className="stroke-status-done transition-[stroke-dasharray] duration-500 ease-out"
          transform="rotate(-90 72 72)"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-foreground">
        {value === null ? "—" : `${pct}%`}
      </span>
    </div>
  );
}

/* —— 积压健康：逾期账龄三分桶（横向条）+ 最长账龄 + 未安排积压 —— */
const AGE_BUCKET_BARS = [
  { labelKey: "insight.ageRecent", tone: "bg-status-overdue/55" }, // 1–3 天：最浅档
  { labelKey: "insight.ageWeek", tone: "bg-status-overdue/78" }, // 4–7 天：中档
  { labelKey: "insight.ageOld", tone: "bg-status-overdue" }, // ≥8 天：最深档
] as const;

function BacklogBlock({ stats, lang }: BlockProps) {
  const maxBucket = Math.max(1, ...stats.overdueAgeBuckets);
  return (
    <Block label={t("insight.overdueAge", lang)} tone="bg-status-overdue">
      <div className="flex flex-col gap-3">
        {stats.overdueAgeBuckets.map((count, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{t(AGE_BUCKET_BARS[i].labelKey, lang)}</span>
            {/* 数据端（右端）4px 圆角、基线端方角；条厚 ≤24px；宽度按桶内峰值归一 */}
            <div className="h-3.5 flex-1">
              <div
                className={cn("h-full rounded-r-[4px] transition-[width] duration-300", AGE_BUCKET_BARS[i].tone)}
                style={{ width: `${(count / maxBucket) * 100}%` }}
              />
            </div>
            {/* 值标条尾：次级编码通道，不依赖悬停 */}
            <span className="w-6 shrink-0 text-right text-[13px] font-semibold tabular-nums text-foreground">{count}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {stats.overdueMaxAgeDays === null
            ? t("insight.noOverdue", lang)
            : t("insight.maxOverdueAge", lang).replace("{n}", String(stats.overdueMaxAgeDays))}
        </span>
        <span className={cn(stats.staleUnscheduledCount > 0 ? "font-medium text-status-overdue" : "text-muted-foreground")}>
          {t("insight.staleUnscheduled", lang).replace("{n}", String(stats.staleUnscheduledCount))}
        </span>
      </div>
    </Block>
  );
}

/* —— 未来 7 天负载：迷你柱状图（今天实心描环 + 头部今日直标，n>0 挂组件 Tooltip）—— */
const WEEKDAY_SHORT = {
  "zh-CN": ["日", "一", "二", "三", "四", "五", "六"],
  "en-US": ["S", "M", "T", "W", "T", "F", "S"],
} as const;

function LoadBlock({ stats, lang }: BlockProps) {
  const days = stats.upcomingLoadDays;
  const peak = Math.max(1, ...days.map((d) => d.count));
  const totalLoad = days.reduce((sum, d) => sum + d.count, 0);
  return (
    <Block label={t("insight.upcomingLoad", lang)} tone="bg-status-today">
      <p className="text-xs text-muted-foreground">
        {t("insight.loadHeadline", lang)
          .replace("{n}", String(days[0]?.count ?? 0))
          .replace("{total}", String(totalLoad))}
      </p>
      <div className="mt-2 flex h-28 items-end gap-1.5" role="img" aria-label={t("insight.upcomingLoad", lang)}>
        <TooltipProvider delayDuration={0} disableHoverableContent>
          {days.map((d, i) => {
            const isToday = i === 0;
            return (
              <Tooltip key={d.key}>
                <TooltipTrigger asChild>
                  {/* 全高命中区（同节奏图）：热区大于柱体本身，tabIndex=-1 不进 Tab 序。
                      每柱顶部直标当日数量（0 也标）——数值不依赖悬停即可读 */}
                  <span className="group/bar flex h-full flex-1 cursor-default flex-col items-center justify-end gap-1" tabIndex={-1}>
                    <span
                      className={cn(
                        "text-[11px] font-semibold leading-none tabular-nums",
                        isToday ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {d.count}
                    </span>
                    <span
                      className={cn(
                        "w-full max-w-7 rounded-t-[4px] transition-[height] duration-300",
                        d.count > 0
                          ? "bg-status-today/70 group-hover/bar:bg-status-today"
                          : "bg-muted-foreground/12",
                        isToday && d.count > 0 && "bg-status-today ring-1 ring-status-today/40",
                      )}
                      style={{ height: `${d.count > 0 ? Math.max(12, (d.count / peak) * 100) : 4}%` }}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="px-2.5 py-1.5">
                  <p className="text-[10px] leading-tight text-primary-foreground/65">{loadDateLabel(d.key, lang)}</p>
                  <p className="text-xs font-semibold leading-tight tabular-nums">
                    {t("insight.loadTooltip", lang).replace("{n}", String(d.count))}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>
      {/* 星期脚标：今天加粗，其余弱化 */}
      <div className="mt-1.5 flex gap-1.5">
        {days.map((d, i) => (
          <span
            key={d.key}
            className={cn(
              "flex-1 text-center text-[11px] leading-tight",
              i === 0 ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {WEEKDAY_SHORT[lang][fromDateKey(d.key).getDay()]}
          </span>
        ))}
      </div>
    </Block>
  );
}

// 负载图气泡日期文案：首柱即今天，与节奏图气泡同款带「（今天）」标记
function loadDateLabel(dayKey: string, lang: "zh-CN" | "en-US"): string {
  const d = fromDateKey(dayKey);
  const suffix = dayKey === todayKey() ? (lang === "zh-CN" ? "（今天）" : " (today)") : "";
  return lang === "zh-CN"
    ? `${d.getMonth() + 1}月${d.getDate()}日${suffix}`
    : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}${suffix}`;
}

/* —— 本周环比：双柱对比（上周弱化档、本周实心）+ 柱顶值直标 + 环比行 —— */
function WeekCompareBlock({ stats, lang }: BlockProps) {
  const peak = Math.max(stats.weekCompleted, stats.lastWeekCompleted, 1);
  const delta = stats.weekDeltaPercent;
  return (
    <Block label={t("insight.weekCompare", lang)} tone="bg-status-done">
      <div className="flex items-end justify-center gap-10">
        <CompareBar label={t("insight.lastWeek", lang)} value={stats.lastWeekCompleted} peak={peak} tone="bg-status-done/55" highlight={false} />
        <CompareBar label={t("insight.thisWeek", lang)} value={stats.weekCompleted} peak={peak} tone="bg-status-done" highlight />
      </div>
      <p className="mt-2.5 text-center text-xs text-muted-foreground">
        {t("insight.vsLastWeek", lang)}
        {delta === null ? (
          <span className="ml-1 text-muted-foreground">—</span>
        ) : delta === 0 ? (
          <span className="ml-1 text-muted-foreground">{t("insight.flat", lang)}</span>
        ) : (
          // 增量数字按方向着色（完成数上升为好 = done 绿，下降 = overdue 红）
          <span className={cn("ml-1 font-medium", delta > 0 ? "text-status-done" : "text-status-overdue")}>
            {delta > 0 ? `+${delta}%` : `${delta}%`}
          </span>
        )}
      </p>
    </Block>
  );
}

// 单根对比柱：值标柱顶（直标 relief 通道），数据端圆角
function CompareBar(props: { label: string; value: number; peak: number; tone: string; highlight: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-semibold text-foreground">{props.value}</span>
      <div className="flex h-24 w-9 items-end">
        <div
          className={cn("w-full rounded-t-[4px] transition-[height] duration-300", props.tone)}
          style={{ height: `${Math.max(props.value > 0 ? 10 : 3, (props.value / props.peak) * 100)}%` }}
        />
      </div>
      <span className={cn("text-[11px] leading-tight", props.highlight ? "font-medium text-foreground" : "text-muted-foreground")}>
        {props.label}
      </span>
    </div>
  );
}

/* —— 近 30 天新建 vs 完成：数字组（净差按方向弱着色）—— */
function FlowBlock({ stats, lang }: BlockProps) {
  const net = stats.netFlow30;
  return (
    <Block label={t("insight.flow30", lang)} tone="bg-status-today">
      <div className="flex items-end justify-between gap-5 py-2">
        <MiniStat label={t("insight.created", lang)} value={String(stats.createdIn30)} tone="text-foreground" />
        <MiniStat label={t("insight.completedShort", lang)} value={String(stats.monthCompleted)} tone="text-foreground" />
        <MiniStat
          label={t("insight.net", lang)}
          value={net > 0 ? `+${net}` : String(net)}
          // 净积压（正）= 待办在增长，弱红提示；净消化（负）= done 绿；持平走 muted
          tone={net > 0 ? "text-status-overdue" : net < 0 ? "text-status-done" : "text-muted-foreground"}
        />
      </div>
    </Block>
  );
}

function MiniStat(props: { label: string; value: string; tone: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <span className={cn("text-2xl font-semibold leading-none", props.tone)}>{props.value}</span>
      <span className="text-xs text-muted-foreground">{props.label}</span>
    </div>
  );
}

/* —— 未结优先级分布：分段条（2px 表面缝隙）+ swatch/名称/计数次级编码 —— */
const PRIORITY_SEGMENTS = [
  { key: "high", labelKey: "priority.high", tone: "bg-priority-high" },
  { key: "medium", labelKey: "priority.medium", tone: "bg-priority-medium" },
  { key: "low", labelKey: "priority.low", tone: "bg-priority-low" },
  { key: "none", labelKey: "priority.none", tone: "bg-muted-foreground/30" }, // 「无」优先级 = 语义缺席，用中性 muted
] as const;

function PriorityMixBlock({ stats, lang }: BlockProps) {
  const mix = stats.priorityMix;
  const total = mix.high + mix.medium + mix.low + mix.none;
  return (
    <Block label={t("insight.priorityMix", lang)} tone="bg-priority-medium">
      {total === 0 ? (
        <div className="h-5 rounded-full bg-muted" />
      ) : (
        // 相邻段 2px 表面缝隙（flex gap 即卡面底色）；段宽按占比 flexGrow 分配，0 计数段宽为 0
        <div className="flex h-5 w-full gap-[2px]">
          {PRIORITY_SEGMENTS.map((seg) => (
            <div key={seg.key} className={cn("h-full rounded-[2px]", seg.tone)} style={{ flexGrow: mix[seg.key] }} />
          ))}
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
        {PRIORITY_SEGMENTS.map((seg) => (
          <span key={seg.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-2.5 shrink-0 rounded-[2px]", seg.tone)} />
            {t(seg.labelKey, lang)}
            <span className="font-medium text-foreground tabular-nums">{mix[seg.key]}</span>
          </span>
        ))}
      </div>
    </Block>
  );
}

// 各子块共用 props：整份 stats（口径见 shared/overviewStats）+ 当前语言
interface BlockProps {
  stats: OverviewStats;
  lang: "zh-CN" | "en-US";
}

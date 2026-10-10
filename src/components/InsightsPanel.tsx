// 概览洞察面板（滚动流渲染，仅「全部」视图）：**时间投入单卡**（2026-10-10 用户决策——
// 按期完成率/本周环比/逾期账龄/未结优先级分布/未来 7 天负载/近 30 天新建 vs 完成六块整体下线，勿加回）。
// **自然月网格**（2026-10-10 同日二次决策：滚动 30 天窗口与「月底复盘」心智对不上）——
// 柱图 = 当月 1 日 → 月末逐日（未来日静态占位，今天不另加可见标记），‹ 月份 › 步进可回看任意历史月（未来月禁用）；
// 主数字 = 本月合计，副行 = 本月日均 · 今日（历史月只给月日均）。
// 步进是图表自身的月份导航（不改变任何任务列表/统计的数据范围），不触碰「概览零筛选控件」红线。
// 数据口径全部来自 shared/overviewStats（唯一真相源）；纯只读零筛选交互、文本一律文本 token、数据色只上柱。
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { addMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { computeMonthInvestment, type MonthInvestmentStats } from "../shared/overviewStats";
import { formatMinutesCompound } from "../shared/taskElapsed";
import type { TaskView } from "../shared/types";
import { useSettingsStore } from "../stores/useSettingsStore";
import { t } from "../lib/i18n";
import { fromDateKey, toDateKey, todayKey } from "../lib/date";

interface Props {
  views: TaskView[];
}

// 指标卡外壳：独立边框/圆角/阴影（与 StatsCard 同款；同样勿加 backdrop-blur——
// 卡片在不透明背景上，模糊只剩合成开销）+ 左侧 2px 语义色条与标签行（可携带右侧头部控件）
function Block(props: { label: string; tone: string; headerExtra?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/85 px-4 py-3.5 shadow-[0_1px_0_0_var(--border)_inset,0_12px_28px_-18px_oklch(0.2_0.04_265/0.35)]">
      <span className={cn("absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[2px] rounded-full opacity-60", props.tone)} />
      <div className="mb-1 flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">{props.label}</p>
        {props.headerExtra}
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center">{props.children}</div>
    </div>
  );
}

export function InsightsPanel({ views }: Props) {
  const lang = useSettingsStore((s) => s.settings.language);
  // 月锚点：null = 跟随当前月；翻页只改本地态（图表导航，不进 ui store、不影响任何筛选口径）
  const [monthKey, setMonthKey] = useState<string | null>(null);
  // now 随 views 变化刷新（与 routes 里 StatsCard 的 useMemo 取时惯例同款）——空依赖会把 currentMonth/
  // 未来月禁用冻结在挂载时刻，跨月长驻会话（桌面端常开）会把上月当「本月」且下一月按钮禁死
  const now = useMemo(() => new Date(), [views]);
  const currentMonth = todayKey(now).slice(0, 7);
  const effectiveMonth = monthKey ?? currentMonth;
  const isCurrentMonth = effectiveMonth === currentMonth;

  const invest = useMemo(
    () => computeMonthInvestment(views, now, monthKey ?? undefined),
    // views/now 任一变化即重算（跨午夜后首个任务变更会带回新鲜 now）
    [views, now, monthKey],
  );

  const [year, monthNumber] = effectiveMonth.split("-").map(Number);
  const monthLabel =
    lang === "zh-CN"
      ? `${year}年${monthNumber}月`
      : new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  // 月份步进：以当月 1 日为锚做月加减，回退键长按可连续回溯；未来月禁用（无可复盘）
  const shiftMonth = (delta: number) =>
    setMonthKey(toDateKey(addMonths(fromDateKey(`${effectiveMonth}-01`), delta)).slice(0, 7));

  return (
    <section aria-label={t("insight.title", lang)} className="mb-4">
      <Block
        label={t("insight.investTitle", lang)}
        tone="bg-status-today"
        headerExtra={
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              aria-label={t("insight.investPrevMonth", lang)}
              onClick={() => shiftMonth(-1)}
              className="grid size-6 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="min-w-20 text-center text-xs font-medium tabular-nums text-foreground">{monthLabel}</span>
            <button
              type="button"
              aria-label={t("insight.investNextMonth", lang)}
              onClick={() => shiftMonth(1)}
              disabled={isCurrentMonth}
              className="grid size-6 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* 主数字组：本月合计 + 日均/今日副行（复合格式，0 投入给「—」占位；历史月今日无意义） */}
          <div className="shrink-0 lg:w-60">
            <p className="text-2xl font-semibold leading-none tabular-nums text-foreground">
              {formatMinutesCompound(invest.totalMinutes, lang)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {isCurrentMonth
                ? t("insight.investHeadlineCur", lang)
                    .replace("{avg}", formatMinutesCompound(invest.avgMinutes, lang))
                    .replace("{today}", formatMinutesCompound(invest.todayMinutes, lang))
                : t("insight.investHeadlinePast", lang).replace("{avg}", formatMinutesCompound(invest.avgMinutes, lang))}
            </p>
          </div>

          {/* 本月每日投入迷你柱：**SVG 整数几何渲染**（2026-10-10 用户两轮实测「发虚」后定稿——
              HTML flex 百分比柱产生非整数宽高，柱边落在物理像素中间被抗锯齿涂成渐变，细柱即虚；
              实测容器宽度后整像素计算全部几何 + crispEdges，边线精确落在像素边界。勿改回百分比 div 柱）。
              视觉/交互规则：有值柱实心今日蓝，零值/未来 = muted 占位；
              不再给今天附加底部蓝色刻度（2026-10-11 用户实测反馈）；气泡仅挂有效柱 */}
          <div className="min-w-0 flex-1">
            <MonthBars invest={invest} lang={lang} />
            {/* 两端日号锚点：自然月网格的排序方向一眼可读（左 1 日 → 右月末） */}
            <div className="mt-1 flex justify-between text-[10px] leading-tight text-muted-foreground/70 tabular-nums">
              <span>{lang === "zh-CN" ? "1日" : "1"}</span>
              <span>{lang === "zh-CN" ? `${invest.dailyKeys.length}日` : String(invest.dailyKeys.length)}</span>
            </div>
          </div>
        </div>
      </Block>
    </section>
  );
}

// 气泡日期文案：今天带「（今天）」标记
function investDateLabel(dayKey: string, lang: "zh-CN" | "en-US"): string {
  const d = fromDateKey(dayKey);
  const suffix = dayKey === todayKey() ? (lang === "zh-CN" ? "（今天）" : " (today)") : "";
  return lang === "zh-CN"
    ? `${d.getMonth() + 1}月${d.getDate()}日${suffix}`
    : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}${suffix}`;
}

// —— 月度投入柱图：SVG 整数几何 + HTML 命中层 ——
// 几何常量：图高 96（原 h-24）、柱间 3px、最小柱宽 4px
const CHART_HEIGHT = 96;
const BAR_GAP = 3;
const MIN_BAR_WIDTH = 4;

/** 柱高（整数像素）：有值柱按峰值归一（最低 10px 保可读）；零值/未来占位 6px。
 *  绘制层（SVG rect）与命中层（透明 span）必须共用本函数——两层几何一旦分叉，气泡就会挂错柱 */
function barHeightOf(minutes: number, peakMinutes: number): number {
  return minutes > 0 ? Math.max(10, Math.round((minutes / peakMinutes) * CHART_HEIGHT)) : 6;
}

function MonthBars({
  invest,
  lang,
}: {
  invest: MonthInvestmentStats;
  lang: "zh-CN" | "en-US";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // 实测容器宽度（ResizeObserver，随窗口/翻月柱数变化重算）——整像素几何的前提
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(Math.floor(el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const barCount = invest.dailyMinutes.length;
  const peakMinutes = Math.max(1, ...invest.dailyMinutes);
  // 柱宽/总宽/居中偏移全部取整：所有 x、宽、高都落在整像素上，crispEdges 关闭抗锯齿后边线无渐变
  const barWidth = Math.max(MIN_BAR_WIDTH, Math.floor((containerWidth - (barCount - 1) * BAR_GAP) / barCount));
  const chartWidth = barCount * barWidth + (barCount - 1) * BAR_GAP;
  const offsetX = Math.max(0, Math.floor((containerWidth - chartWidth) / 2));
  const barLeft = (i: number) => offsetX + i * (barWidth + BAR_GAP);

  return (
    // 容器只包含 96px 柱区；今天的底部蓝色刻度已按 2026-10-11 用户反馈移除
    <div ref={containerRef} className="relative h-24" role="img" aria-label={t("insight.investTitle", lang)}>
      {containerWidth > 0 && (
        <>
          {/* 绘制层：SVG rect 整数几何。**svg 定宽 = 容器实测宽**（rect 的 x 已含居中偏移 barLeft，
              若 svg 只取 chartWidth 宽且自身再偏移，偏移会叠两层——命中层错位 + 末柱被视口裁切，
              2026-10-10 审查确认项）。取色走 CSS 变量 token（明暗主题自动跟随）。
              零投入柱统一为中性占位；SVG 只负责绘制，不参与鼠标命中。 */}
          <svg
            width={containerWidth}
            height={CHART_HEIGHT}
            shapeRendering="crispEdges"
            aria-hidden
            className="pointer-events-none absolute left-0 top-0"
          >
            {invest.dailyMinutes.map((minutes, i) => {
              const barHeight = barHeightOf(minutes, peakMinutes);
              return (
                <rect
                  key={invest.dailyKeys[i]}
                  x={barLeft(i)}
                  y={CHART_HEIGHT - barHeight}
                  width={barWidth}
                  height={barHeight}
                  fill={minutes > 0 ? "var(--status-today)" : "var(--muted-foreground)"}
                  fillOpacity={minutes > 0 ? 1 : 0.12}
                />
              );
            })}
          </svg>

          {/* 命中层：**与柱体同几何**的透明 span（同 left/宽，top/高 = 柱体本身）
              ——柱子上方的空白区悬停不得弹气泡，勿改回全高命中区。
              **仅有效柱挂气泡（2026-10-10 晚用户定调「只有鼠标移到有效蓝色柱才允许弹出气泡」，终版口径）**：
              minutes > 0 才渲染命中层，零值占位与未来日一律不响应——早前「全柱气泡」
              与其反转前的「n>0 门控被否」两轮口径均已作废，以本条为准。工艺不变：组件 Tooltip、
              delayDuration=0 + disableHoverableContent 防 Radix grace-area 相邻柱粘连，勿改回原生 title；
              命中 span 不进 Tab 序、不可获取焦点——避免透明层的焦点描边又被误认为额外柱子；
              容器 role="img" 纯只读 */}
          <TooltipProvider delayDuration={0} disableHoverableContent>
            {invest.dailyMinutes.map((minutes, i) => {
              // 零投入日（含未来日）不挂气泡
              if (minutes <= 0) return null;
              const barHeight = barHeightOf(minutes, peakMinutes);
              return (
                <Tooltip key={invest.dailyKeys[i]}>
                  <TooltipTrigger asChild>
                    <span
                      className="absolute cursor-default outline-none"
                      style={{
                        left: barLeft(i),
                        width: barWidth,
                        top: CHART_HEIGHT - barHeight,
                        height: barHeight,
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6} className="px-2.5 py-1.5">
                    {/* 日期弱化为小字，主行 = 该日投入时长（仅有效柱可到达本分支） */}
                    <p className="text-[10px] leading-tight text-primary-foreground/65">
                      {investDateLabel(invest.dailyKeys[i], lang)}
                    </p>
                    <p className="text-xs font-semibold leading-tight tabular-nums">
                      {formatMinutesCompound(minutes, lang)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </>
      )}
    </div>
  );
}

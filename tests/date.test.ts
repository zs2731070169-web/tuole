// 顺延目标 + 日期键工具测试（时间轴 bucketFor 已随工作台改版下线）
import { describe, it, expect } from "vitest";
import { monthCarouselWindow, monthGrid, rollOverTarget, addDaysKey, compareDateKeys, todayKey, toDateKey, dayKeysInRange, friendlyDate, workbenchDateLabel } from "../src/lib/date";

const NOW = new Date("2026-10-07T10:00:00"); // 周三

describe("rollOverTarget 顺延目标", () => {
  it("tomorrow：直接 +1 天", () => {
    expect(rollOverTarget("2026-10-07", "tomorrow")).toBe("2026-10-08");
  });
  it("nextWeekday：周五顺延跳过周末到下周一", () => {
    // 2026-10-09 是周五，+1=周六 -> 应跳到下周一 10-12
    expect(rollOverTarget("2026-10-09", "nextWeekday")).toBe("2026-10-12");
  });
  it("nextWeekday：周中正常到次日", () => {
    // 2026-10-07 周三 -> 周四 10-08
    expect(rollOverTarget("2026-10-07", "nextWeekday")).toBe("2026-10-08");
  });
});

describe("日期键工具", () => {
  it("compareDateKeys 比较先后", () => {
    expect(compareDateKeys("2026-10-01", "2026-10-07")).toBeLessThan(0);
    expect(compareDateKeys("2026-10-07", "2026-10-07")).toBe(0);
    expect(compareDateKeys("2026-10-08", "2026-10-07")).toBeGreaterThan(0);
  });
  it("addDaysKey 跨月正确", () => {
    expect(addDaysKey("2026-10-31", 1)).toBe("2026-11-01");
  });
  it("todayKey 输出 YYYY-MM-DD", () => {
    expect(todayKey(NOW)).toBe("2026-10-07");
  });
});

describe("日历月视图", () => {
  it("每个月固定渲染 6 行日期格，切月时高度不变", () => {
    expect(monthGrid(new Date("2026-02-01"))).toHaveLength(42);
    expect(monthGrid(new Date("2026-10-01"))).toHaveLength(42);
  });

  it("相邻月份共用连续日期轨道，接缝没有重复日期，切月前后视窗一致", () => {
    for (const [year, month] of [[2026, 0], [2026, 9], [2026, 11], [2028, 1]]) {
      const anchor = new Date(year, month, 1);
      const nextAnchor = new Date(year, month + 1, 1);
      const carousel = monthCarouselWindow(anchor);
      const nextCarousel = monthCarouselWindow(nextAnchor);
      const keys = carousel.days.map(toDateKey);
      const current = keys.slice(carousel.currentRow * 7, carousel.currentRow * 7 + 42);
      const next = keys.slice(carousel.nextRow * 7, carousel.nextRow * 7 + 42);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.slice(0, 42)).toEqual(monthGrid(new Date(year, month - 1, 1)).map(toDateKey));
      expect(current).toEqual(monthGrid(anchor).map(toDateKey));
      expect(next).toEqual(monthGrid(nextAnchor).map(toDateKey));
      expect(next).toEqual(
        nextCarousel.days.map(toDateKey).slice(nextCarousel.currentRow * 7, nextCarousel.currentRow * 7 + 42),
      );
    }
  });
});

describe("dayKeysInRange 闭区间（日历删除模式 Shift 连选）", () => {
  it("正序返回含首尾两端的连续日期键", () => {
    expect(dayKeysInRange("2026-10-08", "2026-10-11")).toEqual([
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("逆序自动归一（Shift 点击顺序任意）", () => {
    expect(dayKeysInRange("2026-10-11", "2026-10-08")).toEqual(dayKeysInRange("2026-10-08", "2026-10-11"));
  });

  it("跨月边界连续不断裂", () => {
    expect(dayKeysInRange("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("首尾同日 = 单日区间", () => {
    expect(dayKeysInRange("2026-10-08", "2026-10-08")).toEqual(["2026-10-08"]);
  });

  it("非法日期键返回空数组，不抛错", () => {
    expect(dayKeysInRange("not-a-date", "2026-10-08")).toEqual([]);
  });
});

describe("workbenchDateLabel 工作台卡片时间锚点（2026-10-09 反馈修正）", () => {
  it("仅真实今天保留相对词「今天」，其余一律绝对日期", () => {
    expect(workbenchDateLabel("2026-10-07", "zh-CN", NOW)).toBe("今天");
    // 明天/昨天在工作台卡片上会与视图框架错位（10号工作台显示「明天」指的却是10号自己）
    expect(workbenchDateLabel("2026-10-08", "zh-CN", NOW)).toBe("10月8日");
    expect(workbenchDateLabel("2026-10-06", "zh-CN", NOW)).toBe("10月6日");
    expect(workbenchDateLabel("2026-10-20", "zh-CN", NOW)).toBe("10月20日");
  });

  it("英文：Today 之外用 locale 感知的绝对短日期（Oct 8，非中文字面量）", () => {
    expect(workbenchDateLabel("2026-10-07", "en-US", NOW)).toBe("Today");
    expect(workbenchDateLabel("2026-10-08", "en-US", NOW)).toBe("Oct 8");
  });

  it("空值返回空串", () => {
    expect(workbenchDateLabel(null, "zh-CN", NOW)).toBe("");
  });
});

describe("friendlyDate 相对词（改期弹层等真实时间框架专用）", () => {
  it("今天/明天/昨天相对词保留，绝对分支按语言渲染", () => {
    expect(friendlyDate("2026-10-07", "zh-CN", NOW)).toBe("今天");
    expect(friendlyDate("2026-10-08", "zh-CN", NOW)).toBe("明天");
    expect(friendlyDate("2026-10-06", "zh-CN", NOW)).toBe("昨天");
    expect(friendlyDate("2026-10-20", "zh-CN", NOW)).toBe("10月20日");
    // 存量 bug 回归：英文绝对分支曾把「M月d日」的中文字面量直接渲染进英文界面
    expect(friendlyDate("2026-10-20", "en-US", NOW)).toBe("Oct 20");
  });
});

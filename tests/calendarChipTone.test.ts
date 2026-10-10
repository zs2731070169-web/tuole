// 日历 chip 着色契约（2026-10-10 用户决策：同组任务一律分组浅底）：
// 背景通道 = 分组（同组任意生命周期同浅底）；文字通道 = 状态（活动态分组深字、
// 逾期红字、完成灰字 + 删除线、未安排灰字）；无分组整对状态色
import { describe, expect, it } from "vitest";
import { calendarChipTone } from "../src/shared/calendarChipTone";
import type { TaskStatus } from "../src/shared/types";

const ALL_STATUSES: TaskStatus[] = ["unscheduled", "upcoming", "today", "overdue", "done"];

/** 从 tone 类名串里取出背景单通道类（group-tone-bg-N）；无则返回 undefined */
function bgClassOf(tone: string): string | undefined {
  return tone.split(" ").find((cls) => cls.startsWith("group-tone-bg-"));
}

describe("calendarChipTone 分组浅底填充", () => {
  it("带分组的任务在任意状态下背景类恒定——同组 → 同一浅底（核心验收）", () => {
    const expectedBg = bgClassOf(calendarChipTone({ group: "工作", status: "today" }));
    expect(expectedBg).toMatch(/^group-tone-bg-\d$/);
    for (const status of ALL_STATUSES) {
      expect(bgClassOf(calendarChipTone({ group: "工作", status }))).toBe(expectedBg);
    }
  });

  it("无分组 → 全状态走状态 chip，不含任何 group-tone 类", () => {
    for (const status of ALL_STATUSES) {
      expect(calendarChipTone({ group: null, status })).not.toMatch(/group-tone/);
    }
  });

  it("状态语义退到文字通道：逾期红字、完成灰字 + 删除线、未安排灰字", () => {
    expect(calendarChipTone({ group: "工作", status: "overdue" })).toContain("text-status-overdue");
    const doneTone = calendarChipTone({ group: "工作", status: "done" });
    expect(doneTone).toContain("text-muted-foreground/70");
    expect(doneTone).toContain("after:"); // 自绘删除线（CSS line-through 在中文 11px 下位置不稳，见实现注释）
    expect(calendarChipTone({ group: "工作", status: "unscheduled" })).toContain("text-muted-foreground");
  });

  it("活动态（today/upcoming）沿用「分组浅底 + 分组深字」整对色", () => {
    for (const status of ["today", "upcoming"] as const) {
      const tone = calendarChipTone({ group: "工作", status });
      expect(tone).toMatch(/group-tone-bg-\d/);
      expect(tone).toMatch(/group-tone-text-\d/);
    }
  });

  it("无分组各状态回归既有状态色（背景/文字锚点抽查）", () => {
    expect(calendarChipTone({ group: null, status: "today" })).toContain("bg-status-today/15");
    expect(calendarChipTone({ group: null, status: "today" })).toContain("text-status-today");
    expect(calendarChipTone({ group: null, status: "overdue" })).toContain("bg-status-overdue/15");
    expect(calendarChipTone({ group: null, status: "upcoming" })).toContain("text-foreground");
    expect(calendarChipTone({ group: null, status: "unscheduled" })).toContain("bg-muted");
    expect(calendarChipTone({ group: null, status: "done" })).toContain("after:");
  });

  it("不同分组名背景档位由哈希决定，同一分组跨调用稳定", () => {
    const toneOf = (group: string, status: TaskStatus) => bgClassOf(calendarChipTone({ group, status }));
    expect(toneOf("工作", "overdue")).toBe(toneOf("工作", "done"));
    expect(toneOf("工作", "today")).toBe(toneOf("工作", "today"));
  });
});

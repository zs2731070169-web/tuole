// 分组维度纯函数：色档哈希 / 词表 / 建议 / 存储归一（分组 = 独立单值字段，与标签解耦）
import { describe, expect, it } from "vitest";
import {
  GROUP_COLOR_COUNT,
  groupColorIndex,
  groupToneClass,
  normalizeGroup,
  collectGroupVocabulary,
  matchGroupSuggestions,
} from "../src/shared/groups";

describe("groupColorIndex 确定性哈希", () => {
  it("同一分组多次调用恒定同档", () => {
    for (const group of ["工作", "产品设计", "a", ""]) {
      expect(groupColorIndex(group)).toBe(groupColorIndex(group));
    }
  });

  it("档位始终落在色板范围内", () => {
    for (const group of ["工作", "生活", "项目A", "分组维度", "shopping"]) {
      expect(groupColorIndex(group)).toBeGreaterThanOrEqual(0);
      expect(groupColorIndex(group)).toBeLessThan(GROUP_COLOR_COUNT);
    }
  });

  it("常见分组样本分布到多个档位（分类色可用性冒烟）", () => {
    const samples = ["工作", "生活", "学习", "项目", "家庭", "阅读", "健身", "出差"];
    expect(new Set(samples.map(groupColorIndex)).size).toBeGreaterThanOrEqual(4);
  });
});

describe("groupToneClass", () => {
  it("非空分组映射到 group-tone-N 类名", () => {
    expect(groupToneClass("工作")).toMatch(/^group-tone-\d$/);
    expect(groupToneClass("工作")).toBe(`group-tone-${groupColorIndex("工作")}`);
  });

  it("空值返回空串，保持调用方默认样式", () => {
    expect(groupToneClass(null)).toBe("");
    expect(groupToneClass(undefined)).toBe("");
    expect(groupToneClass("")).toBe("");
  });
});

describe("normalizeGroup 存储载入", () => {
  it("非字符串/空白 → null；合法值 trim", () => {
    expect(normalizeGroup(undefined)).toBeNull();
    expect(normalizeGroup(42)).toBeNull();
    expect(normalizeGroup("  ")).toBeNull();
    expect(normalizeGroup("")).toBeNull();
    expect(normalizeGroup("  产品设计 ")).toBe("产品设计");
  });
});

describe("分组词表与建议", () => {
  const tasks = [
    { group: "工作" },
    { group: "生活" },
    { group: "工作" },
    { group: null },
  ];

  it("词表收集：去重、按首次出现顺序、无分组任务不参与", () => {
    expect(collectGroupVocabulary(tasks)).toEqual(["工作", "生活"]);
    expect(collectGroupVocabulary([{ group: null }, { group: null }])).toEqual([]);
  });

  it("建议匹配：空 draft 全量浏览；前缀大小写不敏感；已选分组剔除", () => {
    const vocabulary = collectGroupVocabulary(tasks);
    expect(matchGroupSuggestions(vocabulary, "")).toEqual(["工作", "生活"]);
    expect(matchGroupSuggestions(["Pro", "项目"], "p")).toEqual(["Pro"]);
    expect(matchGroupSuggestions(vocabulary, "工", "工作")).toEqual([]);
    expect(matchGroupSuggestions(vocabulary, "不存在的")).toEqual([]);
  });
});

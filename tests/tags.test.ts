// 标签纯函数：切分 / 去重 / 往返 / 存储归一
import { describe, expect, it } from "vitest";
import { collectTagVocabulary, formatTags, matchTagSuggestions, normalizeTags, parseTags } from "../src/shared/tags";

describe("parseTags", () => {
  it("按半/全角逗号、顿号、分号、竖线、换行切分", () => {
    expect(parseTags("a,b，c、d；e;f|g｜h\ni")).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
  });

  it("trim、去空、连续分隔符不产生空标签", () => {
    expect(parseTags("  a ,,、 b  ")).toEqual(["a", "b"]);
  });

  it("按序去重（保留首次出现顺序）", () => {
    expect(parseTags("工作、生活、工作")).toEqual(["工作", "生活"]);
  });

  it("空文本返回空数组", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags("  、， ")).toEqual([]);
  });
});

describe("formatTags 往返", () => {
  it("顿号连接，parseTags(formatTags(x)) === x", () => {
    const tags = ["工作", "复盘", "学习"];
    expect(formatTags(tags)).toBe("工作、复盘、学习");
    expect(parseTags(formatTags(tags))).toEqual(tags);
    expect(formatTags([])).toBe("");
  });
});

describe("normalizeTags 存储载入", () => {
  it("非数组（缺失/字符串/null）返回空数组", () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags("工作")).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it("非字符串元素丢弃、字符串内分隔符再切分、跨元素去重", () => {
    expect(normalizeTags(["工作", 42, null, "工作、生活"])).toEqual(["工作", "生活"]);
  });

  it("合法数组原样保留（远古版本遗留的用户标签不丢）", () => {
    expect(normalizeTags(["工作", "学习"])).toEqual(["工作", "学习"]);
  });
});

describe("标签联想", () => {
  const vocabulary = collectTagVocabulary([
    { tags: ["复盘", "工作"] },
    { tags: ["复盘", "学习"] },
    { tags: [] },
  ]);

  it("词表收集：去重、按首次出现顺序", () => {
    expect(vocabulary).toEqual(["复盘", "工作", "学习"]);
    expect(collectTagVocabulary([{ tags: [] }, { tags: [] }])).toEqual([]);
  });

  it("空 draft 返回全部（聚焦即浏览），已加标签被剔除", () => {
    expect(matchTagSuggestions(vocabulary, "", ["工作"])).toEqual(["复盘", "学习"]);
    expect(matchTagSuggestions(vocabulary, "   ")).toEqual(vocabulary);
  });

  it("前缀匹配大小写不敏感；exclude 同样大小写不敏感", () => {
    expect(matchTagSuggestions(["AI", "api", "算法"], "a")).toEqual(["AI", "api"]); // 「算法」非字母 a 文本前缀，拼音联想不在范围
    expect(matchTagSuggestions(["AI", "api", "算法"], "A")).toEqual(["AI", "api"]);
    expect(matchTagSuggestions(["AI", "api"], "ai", ["aI"])).toEqual([]);
    expect(matchTagSuggestions(["复盘", "工作"], "复")).toEqual(["复盘"]);
  });

  it("无前缀命中返回空数组（列表不显示，不打扰新建任意标签）", () => {
    expect(matchTagSuggestions(vocabulary, "不存在的标签")).toEqual([]);
    expect(matchTagSuggestions([], "任")).toEqual([]);
  });
});

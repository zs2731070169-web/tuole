// 任务标签纯函数：切分 / 格式化 / 归一（无 React 依赖，tests/ 直接覆盖）。
// 标签是纯展示性元数据——不参与状态机、筛选、搜索匹配与统计口径。
// 标签自身永远不含分隔符（入口都走 parseTags 切分），因此 formatTags 的顿号连接可无损往返。

// 分隔符集合：半/全角逗号、顿号、半/全角分号、半/全角竖线、换行（连续多个视作一个）
const TAG_SEPARATORS = /[,，、;；|｜\n]+/;

/** 任意文本 → 标签数组：按分隔符切分、trim、去空、按序去重（保留首次出现顺序） */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(TAG_SEPARATORS)) {
    const tag = part.trim();
    if (tag && !seen.has(tag)) seen.add(tag);
  }
  return [...seen];
}

/** 标签数组 → Excel 单元格 / 展示文本（顿号连接；与 parseTags 互为逆操作） */
export function formatTags(tags: string[]): string {
  return tags.join("、");
}

/** 存储载入校验：非数组返回空；非字符串元素丢弃；合法字符串再走 parseTags 切分去重 */
export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return parseTags(value.filter((item): item is string => typeof item === "string").join("、"));
}

/** 全库任务 → 标签词表：去重、按首次出现顺序。联想候选源——只来自用户存量标签，无预置库 */
export function collectTagVocabulary(tasks: ReadonlyArray<{ tags: string[] }>): string[] {
  const seen = new Set<string>();
  for (const task of tasks) {
    for (const tag of task.tags) {
      if (tag && !seen.has(tag)) seen.add(tag);
    }
  }
  return [...seen];
}

/** 联想匹配（输入即筛）：大小写不敏感**前缀**匹配；draft 为空返回全部（聚焦即浏览）；
 *  exclude（当前已加标签）按大小写不敏感剔除——防近重复候选噪音；保序；无匹配返回空数组 */
export function matchTagSuggestions(vocabulary: string[], draft: string, exclude: string[] = []): string[] {
  const prefix = draft.trim().toLowerCase();
  const excluded = new Set(exclude.map((tag) => tag.toLowerCase()));
  return vocabulary.filter(
    (tag) => !excluded.has(tag.toLowerCase()) && (prefix === "" || tag.toLowerCase().startsWith(prefix)),
  );
}

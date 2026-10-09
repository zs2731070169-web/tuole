// 任务分组维度（2026-10-09 用户决策：分组 = 独立单值字段，与标签解耦）。
// 分组是互斥归类（一任务一组，日历同组同色成块识别）；标签是自由多值标注（纯展示）。
// 色档由分组名哈希决定——确定性、免配置、跨会话稳定：同一分组永远同色、处处同色。
// 色板类 .group-tone-0..9（明暗双模）定义在 styles.css，此处做「分组名 → 档位」与词表纯映射
export const GROUP_COLOR_COUNT = 10;

/** djb2 哈希取模：同分组恒定同档；分组词表天然很小，10 档碰撞罕见且无害（仅共享颜色） */
export function groupColorIndex(group: string): number {
  let hash = 5381;
  for (let i = 0; i < group.length; i++) {
    hash = ((hash << 5) + hash + group.charCodeAt(i)) >>> 0;
  }
  return hash % GROUP_COLOR_COUNT;
}

/** 分组名 → 色档类名（group-tone-N 同时提供背景与文字色）；空值返回空串保持默认样式 */
export function groupToneClass(group: string | null | undefined): string {
  if (!group) return "";
  return `group-tone-${groupColorIndex(group)}`;
}

/** 存储载入归一：非字符串/空白 → null；合法值 trim 后返回（空串视为无分组） */
export function normalizeGroup(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** 全库任务 → 分组词表：去重、按首次出现顺序（编辑抽屉建议 chips 的候选源，只来自存量分组） */
export function collectGroupVocabulary(tasks: ReadonlyArray<{ group: string | null }>): string[] {
  const seen = new Set<string>();
  for (const task of tasks) {
    if (task.group && !seen.has(task.group)) seen.add(task.group);
  }
  return [...seen];
}

/** 建议匹配：大小写不敏感前缀匹配；draft 为空返回全部（点开即浏览）；当前已选分组剔除；无匹配空数组 */
export function matchGroupSuggestions(vocabulary: string[], draft: string, selected: string | null = null): string[] {
  const prefix = draft.trim().toLowerCase();
  return vocabulary.filter((group) => group !== selected && (prefix === "" || group.toLowerCase().startsWith(prefix)));
}

// 搜索框：标题/备注模糊搜索，输入后按回车提交
import { forwardRef, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "../stores/useSettingsStore";
import { t } from "../lib/i18n";

interface Props {
  value: string;
  onSearch: (v: string) => void;
  className?: string;
}

export const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox(
  { value, onSearch, className },
  ref,
) {
  const lang = useSettingsStore((s) => s.settings.language);
  const [draft, setDraft] = useState(value);

  // 外部清空筛选时同步输入框；普通输入只改本地草稿，回车后才真正筛选。
  useEffect(() => setDraft(value), [value]);

  const submit = () => {
    const query = draft.trim();
    setDraft(query);
    onSearch(query);
  };

  const clear = () => {
    setDraft("");
    onSearch("");
  };

  return (
    <div role="search" className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // 中文输入法确认候选时也会触发 Enter；组合输入尚未结束时不提交搜索。
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          submit();
        }}
        placeholder={t("search.placeholder", lang)}
        className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-32 text-[13px] outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {draft && (
          <button
            type="button"
            onClick={clear}
            aria-label={t("search.clear", lang)}
            className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
        <kbd
          className={cn(
            "pointer-events-none inline-flex h-5 items-center whitespace-nowrap rounded border border-border/70 bg-muted/60 px-1.5 font-sans text-[10px] font-medium text-muted-foreground",
            draft !== value && "border-status-today/30 bg-status-today/10 text-status-today",
          )}
        >
          {t("search.submitHint", lang)}
        </kbd>
      </div>
    </div>
  );
});

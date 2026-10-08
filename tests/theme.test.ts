// 主题解析测试：light/dark 直接返回，system 读取 matchMedia 偏好
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTheme } from "../src/lib/theme";

function mockMatchMedia(matches: boolean) {
  // @ts-expect-error 测试桩
  globalThis.window = { matchMedia: vi.fn().mockReturnValue({ matches }) };
}

describe("resolveTheme", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("light 模式恒为 light", () => {
    mockMatchMedia(true); // 即便系统偏暗也应被显式覆盖
    expect(resolveTheme("light")).toBe("light");
  });

  it("dark 模式恒为 dark", () => {
    mockMatchMedia(false);
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("system + 系统偏暗 -> dark", () => {
    mockMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
  });

  it("system + 系统偏亮 -> light", () => {
    mockMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("无 window.matchMedia 时 system 回退 light", () => {
    // @ts-expect-error 清空环境
    globalThis.window = {};
    expect(resolveTheme("system")).toBe("light");
  });
});

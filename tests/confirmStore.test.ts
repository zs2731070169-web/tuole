// 全局确认弹窗状态：确认语义可定制，Promise 必须在确认/取消时可靠结算
import { beforeEach, describe, expect, it } from "vitest";
import { useConfirmStore } from "../src/stores/useConfirmStore";

beforeEach(() => {
  useConfirmStore.setState({ pending: null });
});

describe("useConfirmStore", () => {
  it("保留恢复操作的按钮文案与强调色，并在确认后返回 true", async () => {
    const result = useConfirmStore.getState().ask("恢复这份备份？", {
      confirmLabel: "恢复",
      tone: "accent",
    });

    expect(useConfirmStore.getState().pending).toMatchObject({
      message: "恢复这份备份？",
      confirmLabel: "恢复",
      tone: "accent",
    });

    useConfirmStore.getState().settle(true);
    await expect(result).resolves.toBe(true);
    expect(useConfirmStore.getState().pending).toBeNull();
  });

  it("新的确认请求会把尚未处理的旧请求按取消结算", async () => {
    const first = useConfirmStore.getState().ask("第一个请求");
    const second = useConfirmStore.getState().ask("第二个请求");

    await expect(first).resolves.toBe(false);
    useConfirmStore.getState().settle(false);
    await expect(second).resolves.toBe(false);
  });
});

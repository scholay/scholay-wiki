// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "../src/shared/lib/clipboard";

const originalClipboard = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  });
  vi.restoreAllMocks();
});

describe("clipboard fallback", () => {
  it("在非安全上下文通过 copy 事件写入完整文本", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const setData = vi.fn();
    document.execCommand = vi.fn(() => {
      const event = new Event("copy", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { setData },
      });
      document.dispatchEvent(event);
      return true;
    });

    expect(await copyToClipboard("完整提问模板")).toBe(true);
    expect(setData).toHaveBeenCalledWith("text/plain", "完整提问模板");
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WikiPromptTabs } from "../src/features/wiki/components/WikiPromptTabs";

const { copyToClipboard } = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async () => true),
}));

vi.mock("../src/shared/lib/clipboard", () => ({ copyToClipboard }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  cleanup();
  copyToClipboard.mockClear();
});

describe("Wiki 文档引导组件", () => {
  it("Prompt tabs 复用可访问 tabs，并复制当前场景原文", async () => {
    render(
      <WikiPromptTabs
        group={{
          id: "search-question",
          title: "可复制 Prompt",
          options: [
            {
              id: "general",
              label: "通用研究",
              prompt:
                "围绕【研究主题】检索近三年的代表性研究，并说明证据边界。",
            },
            {
              id: "medical",
              label: "医学",
              prompt:
                "检索【疾病】中【干预】与【结局】的研究，并区分研究设计。",
            },
          ],
        }}
      />,
    );

    const first = screen.getByRole("tab", { name: "通用研究" });
    const second = screen.getByRole("tab", { name: "医学" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(second.getAttribute("aria-controls")).toContain("medical");
    expect(screen.getByRole("tabpanel")).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "复制“通用研究”提示词" }),
    );
    expect(copyToClipboard).toHaveBeenCalledWith(
      "围绕【研究主题】检索近三年的代表性研究，并说明证据边界。",
    );
    expect(
      await screen.findByRole("button", {
        name: "已复制“通用研究”提示词",
      }),
    ).not.toBeNull();
  });
});

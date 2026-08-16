import { useState } from "react";
import { FlaskConical, RotateCcw, X } from "lucide-react";
import { useHotkey } from "@/shared/hooks/useHotkey";
import {
  MOCK_STORAGE,
  getMockLatency,
  getMockScenario,
  type MockScenario,
} from "./config";
import { resetMockDatabase } from "./database";
import {
  getMockPersona,
  MOCK_PERSONAS,
  setMockPersona,
  type MockPersona,
} from "./personas";
import { useInvitePromptStore } from "@/stores/invite-prompt.store";
import { useFundsReminderStore } from "@/stores/funds-reminder.store";
import {
  getMockBilling,
  MOCK_BILLING_STORAGE_KEY,
  setMockBilling,
  type MockBillingState,
  type MockBillingTier,
} from "./billing-state";

const routes = [
  ["首页", "/"],
  ["检索", "/search"],
  ["文献集", "/library"],
  ["智能助手", "/claw"],
  ["智能写作", "/prism"],
  ["智能审稿", "/peer-review"],
  ["会员", "/settings/membership"],
  ["后台", "/admin"],
] as const;

/** 开发板专用样式 —— 刻意不用产品 token,避免和站内控件长得一样。 */
const shell =
  "font-mono text-[11px] leading-snug text-lime-200/95 shadow-[0_10px_40px_rgba(0,0,0,0.55)]";
const field =
  "h-8 w-full cursor-pointer rounded-sm border border-lime-500/25 bg-black/50 px-2 text-[11px] text-lime-100 outline-none focus:border-lime-400/60";
const label = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-lime-500/70";

export function MockControlPanel() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(MOCK_STORAGE.panelCollapsed) === "true";
    } catch {
      return false;
    }
  });
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(MOCK_STORAGE.panelHidden) === "true";
    } catch {
      return false;
    }
  });
  const persona = getMockPersona();
  const latency = getMockLatency();
  const scenario = getMockScenario();
  const billing = getMockBilling();

  const setPanelCollapsed = (value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem(MOCK_STORAGE.panelCollapsed, String(value));
    } catch {
      // 不支持持久化时只影响当前页。
    }
  };

  const togglePanelHidden = () => {
    setHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MOCK_STORAGE.panelHidden, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // 完全隐藏/唤回 —— 录屏演示用；隐藏后组件仍挂载,快捷键始终生效。
  useHotkey("mod+shift+m", togglePanelHidden);

  const switchPersona = (next: MockPersona) => {
    if (next === persona) return;
    setMockPersona(next);
    window.location.reload();
  };

  const changeLatency = (value: string) => {
    try {
      localStorage.setItem(MOCK_STORAGE.latency, value);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const changeScenario = (value: MockScenario) => {
    try {
      localStorage.setItem(MOCK_STORAGE.scenario, value);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  // 计费组合(会员档位 × 经费 × 刷新券)改动后整页刷新,让 overview 缓存重建。
  const changeBilling = (patch: Partial<MockBillingState>) => {
    setMockBilling(patch);
    window.location.reload();
  };

  const reset = () => {
    resetMockDatabase();
    [
      "scholay.staging-areas",
      "scholay.staging-ui",
      "scholay.browser-tabs-v1",
      "scholay:claw:blocked-message",
      "scholay:mock:admin:v1",
      MOCK_BILLING_STORAGE_KEY,
    ].forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();
    window.location.assign("/");
  };

  if (hidden) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="展开 Mock 控制台"
        onClick={() => setPanelCollapsed(false)}
        className={`${shell} fixed bottom-3 right-3 z-[100] inline-flex h-8 cursor-pointer items-center gap-2 rounded-sm border border-dashed border-lime-400/50 bg-zinc-950 px-2.5 uppercase tracking-[0.12em] hover:border-lime-300 hover:bg-zinc-900`}
      >
        <span className="inline-flex size-1.5 animate-pulse rounded-full bg-lime-400" />
        <FlaskConical className="size-3.5 text-lime-400" strokeWidth={2} />
        <span className="text-lime-400">DEV</span>
        <span className="text-lime-200/40">|</span>
        <span>MOCK · {MOCK_PERSONAS[persona].label}</span>
      </button>
    );
  }

  return (
    <aside
      className={`${shell} fixed bottom-3 right-3 z-[100] w-80 rounded-sm border border-dashed border-lime-400/45 bg-zinc-950/95 p-3 backdrop-blur-sm`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-lime-500/20 pb-2">
        <div>
          <div className="flex items-center gap-2 font-semibold uppercase tracking-[0.16em] text-lime-300">
            <span className="inline-flex size-1.5 animate-pulse rounded-full bg-lime-400" />
            <FlaskConical className="size-3.5 text-lime-400" strokeWidth={2} />
            DEV · MOCK BOARD
          </div>
          <p className="mt-1.5 text-[10px] normal-case tracking-normal text-lime-200/45">
            browser-only · no real backend · mod+shift+M hide
          </p>
        </div>
        <button
          type="button"
          aria-label="收起 Mock 控制台"
          onClick={() => setPanelCollapsed(true)}
          className="cursor-pointer rounded-sm p-1 text-lime-500/70 hover:bg-lime-400/10 hover:text-lime-200"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mt-3">
        <label htmlFor="mock-persona" className={label}>
          Persona
        </label>
        <select
          id="mock-persona"
          value={persona}
          onChange={(event) => switchPersona(event.target.value as MockPersona)}
          className={field}
        >
          {Object.values(MOCK_PERSONAS).map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.label} — {definition.description}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2.5">
        <label htmlFor="mock-scenario" className={label}>
          Scenario
        </label>
        <select
          id="mock-scenario"
          value={scenario}
          onChange={(event) =>
            changeScenario(event.target.value as MockScenario)
          }
          className={field}
        >
          <option value="happy">happy · 正常数据</option>
          <option value="server-error">server-error · 服务异常</option>
          <option value="auth-expired">auth-expired · 登录过期</option>
          <option value="quota">quota · AI 额度耗尽</option>
        </select>
      </div>

      <div className="mt-2.5">
        <label htmlFor="mock-latency" className={label}>
          Latency
        </label>
        <select
          id="mock-latency"
          value={String(latency)}
          onChange={(event) => changeLatency(event.target.value)}
          className={field}
        >
          <option value="0">0ms · instant</option>
          <option value="180">180ms · normal</option>
          <option value="800">800ms · slow</option>
          <option value="1800">1800ms · crawl</option>
        </select>
      </div>

      {/* 计费组合:三个条件(档位/经费/刷新券)决定「经费不足提醒」的文案与按钮;
          第四个条件(对话页 vs 非对话页)由触发时屏上有无对话消息区自动分流。 */}
      <div className="mt-3 border-t border-lime-500/20 pt-2.5">
        <span className={label}>Billing · 经费不足提醒</span>
        <div className="grid grid-cols-3 gap-1.5">
          <select
            aria-label="会员档位"
            value={billing.tier}
            onChange={(event) =>
              changeBilling({ tier: event.target.value as MockBillingTier })
            }
            className={field}
          >
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="max">Max</option>
          </select>
          <select
            aria-label="经费"
            value={String(billing.credit)}
            onChange={(event) =>
              changeBilling({ credit: event.target.value === "true" })
            }
            className={field}
          >
            <option value="true">有经费</option>
            <option value="false">无经费</option>
          </select>
          <select
            aria-label="刷新券"
            value={String(billing.passes)}
            onChange={(event) =>
              changeBilling({ passes: event.target.value === "true" })
            }
            className={field}
          >
            <option value="true">有刷新券</option>
            <option value="false">无刷新券</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => useFundsReminderStore.getState().trigger()}
          title="对话消息区在屏 → 对话内消息体;否则 → 全局弹窗"
          className="mt-1.5 inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-sm border border-lime-400/40 bg-lime-400/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-lime-200 hover:bg-lime-400/20"
        >
          触发经费不足提醒
        </button>
      </div>

      <nav aria-label="Mock 快速跳转" className="mt-3 flex flex-wrap gap-1">
        {routes.map(([labelText, href]) => (
          <a
            key={href}
            href={href}
            className="cursor-pointer rounded-sm border border-lime-500/20 bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-lime-200/70 hover:border-lime-400/50 hover:bg-lime-400/10 hover:text-lime-100"
          >
            {labelText}
          </a>
        ))}
        <button
          type="button"
          onClick={() => {
            // 先切访客再带 invite 刷新,否则默认研究者已登录不会弹注册窗
            setMockPersona("visitor");
            window.location.assign("/?invite=SCHOLAY2026");
          }}
          className="cursor-pointer rounded-sm border border-lime-500/20 bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-lime-200/70 hover:border-lime-400/50 hover:bg-lime-400/10 hover:text-lime-100"
          title="打开带邀请码的注册弹窗（锁定已填写态）"
        >
          邀请注册
        </button>
        <button
          type="button"
          onClick={() => {
            // 清「已提醒」标记后以研究者身份弹新用户补填窗
            try {
              localStorage.removeItem("scholay.auth.invite_prompt_done");
            } catch {
              // ignore
            }
            setMockPersona("researcher");
            useInvitePromptStore.getState().openForNewUser(1001);
          }}
          className="cursor-pointer rounded-sm border border-lime-500/20 bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-lime-200/70 hover:border-lime-400/50 hover:bg-lime-400/10 hover:text-lime-100"
          title="模拟新用户首次登录补填邀请码弹窗"
        >
          新用户邀请
        </button>
      </nav>

      <button
        type="button"
        onClick={reset}
        className="mt-3 inline-flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-amber-400/40 bg-amber-400/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200 hover:bg-amber-400/20"
      >
        <RotateCcw className="size-3" />
        Reset demo data
      </button>
    </aside>
  );
}

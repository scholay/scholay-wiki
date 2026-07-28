import { useState } from "react";
import { FlaskConical, RotateCcw, X } from "lucide-react";
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

export function MockControlPanel() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(MOCK_STORAGE.panelCollapsed) === "true";
    } catch {
      return false;
    }
  });
  const persona = getMockPersona();
  const latency = getMockLatency();
  const scenario = getMockScenario();

  const setPanelCollapsed = (value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem(MOCK_STORAGE.panelCollapsed, String(value));
    } catch {
      // 不支持持久化时只影响当前页。
    }
  };

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

  const reset = () => {
    resetMockDatabase();
    [
      "scholay.staging-areas",
      "scholay.staging-ui",
      "scholay.browser-tabs-v1",
      "scholay:claw:blocked-message",
      "scholay:mock:admin:v1",
    ].forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();
    window.location.assign("/");
  };

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="展开 Mock 控制台"
        onClick={() => setPanelCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 inline-flex h-9 items-center gap-2 rounded-pill border border-border-button bg-background px-3 text-sm font-medium text-foreground"
      >
        <FlaskConical className="size-4 text-brand-green" />
        Mock · {MOCK_PERSONAS[persona].label}
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border border-border-button bg-background p-3 text-base text-foreground">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <FlaskConical className="size-4 text-brand-green" />
            产品设计 Mock
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            全部数据在浏览器内运行，不访问真实后端
          </p>
        </div>
        <button
          type="button"
          aria-label="收起 Mock 控制台"
          onClick={() => setPanelCollapsed(true)}
          className="rounded-sm p-1 text-faint hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3">
        <label
          htmlFor="mock-persona"
          className="mb-1 block text-xs font-medium text-subtle"
        >
          身份场景
        </label>
        <select
          id="mock-persona"
          value={persona}
          onChange={(event) => switchPersona(event.target.value as MockPersona)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {Object.values(MOCK_PERSONAS).map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.label} — {definition.description}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label
          htmlFor="mock-scenario"
          className="mb-1 block text-xs font-medium text-subtle"
        >
          请求场景
        </label>
        <select
          id="mock-scenario"
          value={scenario}
          onChange={(event) =>
            changeScenario(event.target.value as MockScenario)
          }
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="happy">正常数据</option>
          <option value="server-error">服务异常</option>
          <option value="auth-expired">登录过期</option>
          <option value="quota">AI 额度耗尽</option>
        </select>
      </div>

      <div className="mt-3">
        <label
          htmlFor="mock-latency"
          className="mb-1 block text-xs font-medium text-subtle"
        >
          接口延迟
        </label>
        <select
          id="mock-latency"
          value={String(latency)}
          onChange={(event) => changeLatency(event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="0">即时</option>
          <option value="180">常规 · 180ms</option>
          <option value="800">慢网 · 800ms</option>
          <option value="1800">极慢 · 1.8s</option>
        </select>
      </div>

      <nav aria-label="Mock 快速跳转" className="mt-3 flex flex-wrap gap-1.5">
        {routes.map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="rounded-pill border border-border px-2.5 py-1 text-xs text-subtle hover:border-border-button hover:bg-surface-1 hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      <button
        type="button"
        onClick={reset}
        className="mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border-button text-xs font-medium text-subtle hover:bg-surface-2 hover:text-foreground"
      >
        <RotateCcw className="size-3.5" />
        复位演示数据
      </button>
    </aside>
  );
}

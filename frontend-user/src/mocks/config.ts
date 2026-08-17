export const MOCK_MODE = import.meta.env.VITE_MOCK_MODE !== "off";

export const MOCK_STORAGE = {
  persona: "scholay.mock.persona",
  database: "scholay.mock.database.v1",
  latency: "scholay.mock.latency",
  scenario: "scholay.mock.scenario",
  panelCollapsed: "scholay.mock.panel-collapsed",
  panelHidden: "scholay.mock.panel-hidden",
} as const;

export const DEFAULT_MOCK_LATENCY = 180;
export type MockScenario = "happy" | "server-error" | "auth-expired" | "quota";

export function getMockLatency(): number {
  try {
    const value = Number(localStorage.getItem(MOCK_STORAGE.latency));
    return Number.isFinite(value) && value >= 0
      ? Math.min(value, 3000)
      : DEFAULT_MOCK_LATENCY;
  } catch {
    return DEFAULT_MOCK_LATENCY;
  }
}

export function getMockScenario(): MockScenario {
  try {
    const value = localStorage.getItem(MOCK_STORAGE.scenario);
    return value === "server-error" ||
      value === "auth-expired" ||
      value === "quota"
      ? value
      : "happy";
  } catch {
    return "happy";
  }
}

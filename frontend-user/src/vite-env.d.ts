/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  /** 'off' 才连接真实后端；未设置或 'full' 时启用浏览器内完整 Mock 后端。 */
  readonly VITE_MOCK_MODE?: "full" | "off";
  /** 临时开关:'true' 时智能写作(Prism)入口显示「即将推出」+ 页面蒙层(本版上线先盖,迭代完再翻)。 */
  readonly VITE_PRISM_COMING_SOON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Vite 在 HTML 最前注入，供 React 启动前的统计/配置脚本决定是否禁用外部请求。 */
  __SCHOLAY_MOCK_MODE__?: boolean;
}

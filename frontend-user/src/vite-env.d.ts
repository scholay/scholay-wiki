/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SITE_URL: string;
  readonly VITE_SITE_NAME: string;
  /** 临时开关:'true' 时智能写作(Prism)入口显示「即将推出」+ 页面蒙层(本版上线先盖,迭代完再翻)。 */
  readonly VITE_PRISM_COMING_SOON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WikiAudiencePreview = "auto" | "public" | "admin";

interface WikiDevState {
  /** 预览受众：覆盖真实登录角色，方便写 wiki 时核对公开/管理员视图 */
  audiencePreview: WikiAudiencePreview;
  setAudiencePreview: (value: WikiAudiencePreview) => void;
}

export const useWikiDevStore = create<WikiDevState>()(
  persist(
    (set) => ({
      audiencePreview: "auto",
      setAudiencePreview: (audiencePreview) => set({ audiencePreview }),
    }),
    { name: "scholay.wiki.dev" },
  ),
);

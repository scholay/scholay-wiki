import { canAccessAdmin, useAuthStore } from "@/stores/auth.store";
import { useWikiDevStore } from "../stores/wiki-dev.store";

/**
 * Wiki 管理员内容可见性。
 * DEV 面板的 audiencePreview 可覆盖真实角色，便于作者核对公开视图。
 */
export function useCanSeeWikiAdmin(): boolean {
  const role = useAuthStore((state) => state.user?.role);
  const preview = useWikiDevStore((state) => state.audiencePreview);
  if (preview === "public") return false;
  if (preview === "admin") return true;
  return canAccessAdmin(role);
}

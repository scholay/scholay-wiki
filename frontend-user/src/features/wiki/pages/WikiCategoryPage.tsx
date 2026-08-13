import { Navigate, useParams } from "react-router-dom";
import {
  firstNavHref,
  navCategoryBySlug,
  visibleNavCategories,
} from "../content";
import { useCanSeeWikiAdmin } from "../hooks/useWikiAccess";

/** 旧栏目地址不再单独成页，直接落到该栏第一篇二级词条。 */
export function WikiCategoryPage() {
  const { categorySlug } = useParams();
  const canSeeAdmin = useCanSeeWikiAdmin();
  const category = navCategoryBySlug(categorySlug);
  const visible = visibleNavCategories(canSeeAdmin).some(
    (item) => item.slug === categorySlug,
  );
  if (!category || !visible) return <Navigate to="/wiki" replace />;

  return <Navigate to={firstNavHref(category.children) ?? "/wiki"} replace />;
}

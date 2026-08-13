import { cn } from "@/shared/lib/utils";
import {
  WIKI_PRODUCT_MENUS,
  type WikiProductMenu,
  type WikiProductMenuId,
} from "../content/product-menus";

/**
 * 顶栏宫灯 MenuCarousel 的静态复刻：七项横排，当前功能为选中态。
 * 无 scrub、无循环拷贝、无跳转。
 */
export function WikiProductMenuDock({
  activeId,
}: {
  activeId: WikiProductMenuId;
}) {
  return (
    <div
      aria-hidden
      className="flex w-full items-center justify-start gap-1 overflow-x-auto md:justify-center"
    >
      {WIKI_PRODUCT_MENUS.map((menu) => (
        <WikiProductMenuChip
          key={menu.id}
          menu={menu}
          active={menu.id === activeId}
        />
      ))}
    </div>
  );
}

function WikiProductMenuChip({
  menu,
  active,
}: {
  menu: WikiProductMenu;
  active: boolean;
}) {
  const Icon = menu.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-8 font-medium",
        active
          ? "h-9 bg-foreground px-4 text-14 text-on-dark"
          : "h-7 px-2.5 text-12 text-faint",
      )}
    >
      <Icon className="size-3.5" strokeWidth={active ? 2.1 : 1.8} />
      {menu.label}
    </span>
  );
}

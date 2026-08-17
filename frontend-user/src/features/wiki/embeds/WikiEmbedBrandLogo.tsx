import { BrandLogo, type BrandLogoProps } from "@/shared/components/BrandLogo";
import { cn } from "@/shared/lib/utils";

/**
 * Wiki fixture 内的品牌锁定组合：亮色保持原始版本，暗色改用产品壳已经采用的
 * 彩色 mark，避免文字标中的黑色字形消失在暗底上。
 */
export function WikiEmbedBrandLogo({
  className,
  variant = "full",
  ...props
}: BrandLogoProps) {
  if (variant === "mark") {
    return <BrandLogo {...props} variant="mark" className={className} />;
  }

  return (
    <span className={cn("inline-flex items-center", className)}>
      <BrandLogo
        {...props}
        variant={variant}
        className="wiki-embed-brand-logo-light"
      />
      <BrandLogo
        {...props}
        variant="mark"
        className="wiki-embed-brand-logo-dark"
      />
    </span>
  );
}

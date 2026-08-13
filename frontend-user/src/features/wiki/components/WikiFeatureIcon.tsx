import {
  type WikiFeatureIconSlug,
  wikiFeatureIconSrc,
} from "../visuals/catalog";

interface WikiFeatureIconProps {
  slug: WikiFeatureIconSlug;
  className?: string;
}

export function WikiFeatureIcon({ slug, className }: WikiFeatureIconProps) {
  return (
    <img
      src={wikiFeatureIconSrc(slug)}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      className={`wiki-feature-icon ${className ?? ""}`}
    />
  );
}

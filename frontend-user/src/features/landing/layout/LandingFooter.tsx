import { Link } from 'react-router-dom';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { BrandName } from '@/shared/components/BrandName';
import { LANDINGS, LANDING_ORDER } from '../data/landings';

/**
 * Landing 页底部 4 列 footer —— .pen 各 Landing 页底部 sitemap 风格 footer:
 *   产品 / 资源 / 公司 / 法律 + 上方 logo + 描述 + 下方版权行
 *
 * 区别于首页的 mini Footer(44px) —— 那是首页用的极简版,这是宣传页的完整版。
 */

// 之前几个 # 占位都改成实际可用路由;不存在的功能(更新日志 / 加入我们 / 数据安全
// 等)直接从列表里删,避免点了 404 或停在原地。"联系我们"也改成 /feedback —— 这
// 是用户与团队最常的实际触点,避免再做一个空联系页
const RESOURCES = [
  { label: '学术资源', href: '/resources' },
  { label: '产品博客', href: '/blog' },
  { label: '帮助中心', href: '/help' },
];

const COMPANY = [
  { label: '关于我们', href: '/about' },
  { label: '联系我们', href: '/contact' },
  { label: '反馈建议', href: '/feedback' },
];

const LEGAL = [
  { label: '隐私政策', href: '/privacy' },
  { label: '服务条款', href: '/terms' },
  { label: '免责声明', href: '/disclaimer' },
];

function LinkCol({
  title,
  items,
}: {
  title: string;
  items: { label: string; href: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-12 font-medium uppercase text-foreground">
        {title}
      </span>
      <ul className="flex flex-col gap-2">
        {items.map((it) =>
          it.href.startsWith('/') ? (
            <li key={it.label}>
              <Link
                to={it.href}
                className="text-12 text-muted-foreground hover:text-foreground transition-colors"
              >
                {it.label}
              </Link>
            </li>
          ) : (
            <li key={it.label}>
              <a
                href={it.href}
                className="text-12 text-muted-foreground hover:text-foreground transition-colors"
              >
                {it.label}
              </a>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  const products = LANDING_ORDER.map((k) => {
    const f = LANDINGS[k];
    return { label: f.name, href: `/features/${f.slug}` };
  });

  return (
    <footer className="bg-surface-1 border-t border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-12">
          {/* 品牌列 */}
          <div className="col-span-2 flex flex-col gap-4">
            <BrandLogo size="sm" />
            <p className="text-12 leading-paragraph text-muted-foreground max-w-xs">
              为学者打造的整套学术工作流,从读到写、从投稿到评审,一站完成。
            </p>
          </div>

          <LinkCol title="产品" items={products} />
          <LinkCol title="资源" items={RESOURCES} />
          <LinkCol title="公司" items={COMPANY} />
          <LinkCol title="法律" items={LEGAL} />
        </div>

        <div className="mt-12 pt-6 border-t border-border-soft flex flex-col sm:flex-row items-center gap-3 justify-between">
          <span className="text-12 text-faint">
            © {new Date().getFullYear()} <BrandName tone="subtle" /> · 让学术研究更聪明。
          </span>
          <div className="flex items-center gap-4 text-12 text-muted-foreground">
            <span className="text-foreground font-medium">简体中文</span>
            <span>English</span>
            <span>日本語</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

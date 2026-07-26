import { Link } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import { BrandName } from './BrandName';

/**
 * 首页底部 —— 对齐 .pen `l4Cvd`,单行 brand / 法律链接。
 *
 *   © 2026 Scholay │ 关于 │ 隐私 │ 服务 │ 帮助 │ [解决方案 ▾]
 *                                                  └─ popover:文献搜索 / 文献集 /
 *                                                              Prism / Claw / 投稿 / 同行评审
 *
 * 之前的"6 个功能介绍页"行已折叠进右侧的"解决方案" popover —— 单行更干净,
 * 仍能从底部访问全部宣传页。
 *
 * 6 个 feature 链接 hard-coded 来源对应 features/landing/data/landings.ts 的 LANDING_ORDER,
 * 但 Footer 在 shared/ 层,不能 import features/。这里直接列字面量,
 * 维护成本可接受 —— Landing 数量是稳定的 6 个,不会频繁变动。
 */

/**
 * 解决方案 popover 链接 —— label 与顶栏菜单(menus.ts)的真实功能名对齐:
 *
 *   宣传页 slug          → 产品菜单功能名
 *   /features/search      文献搜索 ✓
 *   /features/library     文献集 ✓
 *   /features/prism       智能写作(原 "Prism AI 写作")
 *   /features/claw        智能助手(原 "Claw AI 助手")
 *   /features/submit      智能投稿 ─┐ 都指向"智能审稿" feature
 *   /features/peer-review 同行评审 ─┘
 */
const SOLUTION_LINKS: { label: string; to: string; desc: string }[] = [
  { label: '文献搜索', to: '/features/search', desc: '全网检索文献与学者' },
  { label: '文献集', to: '/features/library', desc: '收藏 / 文件夹 / 跨设备同步' },
  { label: '智能写作', to: '/features/prism', desc: '科研级 LaTeX 协作写作' },
  { label: '智能助手', to: '/features/claw', desc: '智能问答与对话' },
  { label: '智能投稿', to: '/features/submit', desc: '投稿前 AI 预审' },
  { label: '同行评审', to: '/features/peer-review', desc: '同行评审与意见沉淀' },
];

/** 法律 / 关于类链接 —— 路径与旧 frontend-user 保持一致(SEO 不丢) */
const BRAND_LINKS: { label: string; to: string }[] = [
  { label: '关于我们', to: '/about' },
  { label: '学术资源', to: '/resources' },
  { label: '帮助中心', to: '/help' },
  { label: '隐私政策', to: '/privacy' },
  { label: '服务条款', to: '/terms' },
];

export function Footer() {
  return (
    <footer className="bg-background border-t border-border">
      {/* 单行:brand / 法律 + 解决方案 popover */}
      <div className="h-11 flex items-center justify-center gap-6 text-xs text-faint">
        <span>
          © {new Date().getFullYear()} <BrandName tone="subtle" />
        </span>
        {BRAND_LINKS.map((l) => (
          <span key={l.label} className="flex items-center gap-6">
            <span className="h-3.5 w-px bg-border-strong" />
            <Link
              to={l.to}
              className="hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          </span>
        ))}

        <span className="flex items-center gap-6">
          <span className="h-3.5 w-px bg-border-strong" />
          <PopoverPrimitive.Root>
            <PopoverPrimitive.Trigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
              >
                解决方案
                <ChevronDown className="size-3" strokeWidth={2.5} />
              </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                align="end"
                side="top"
                sideOffset={6}
                className="z-popover w-64 rounded-md border border-border bg-surface-card p-1.5"
              >
                <div className="flex flex-col">
                  {SOLUTION_LINKS.map((l) => (
                    <PopoverPrimitive.Close asChild key={l.to}>
                      <Link
                        to={l.to}
                        className="flex flex-col gap-0.5 px-2.5 py-2 rounded-sm hover:bg-surface-1 transition-colors text-left"
                      >
                        <span className="text-sm font-semibold text-foreground">
                          {l.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {l.desc}
                        </span>
                      </Link>
                    </PopoverPrimitive.Close>
                  ))}
                </div>
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
        </span>

        {/* ICP 备案 —— 中国大陆运营要求;同行尾部,链到工信部官方查询页 */}
        <span className="flex items-center gap-6">
          <span className="h-3.5 w-px bg-border-strong" />
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            蜀ICP备2025145653号-2
          </a>
        </span>
      </div>
    </footer>
  );
}

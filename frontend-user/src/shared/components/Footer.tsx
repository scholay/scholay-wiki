import { Link } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import { icpBeian } from '@/shared/lib/site-config';
import { BrandName } from './BrandName';

/**
 * 首页底部 —— 对齐 .pen `l4Cvd`,单行 brand / 法律链接。
 *
 *   © 2026 Scholay │ 关于 │ 隐私 │ 服务 │ 帮助 │ [解决方案 ▾]
 *                                                  └─ popover:文献搜索 / 文件夹 /
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
 *   /features/library     文件夹 ✓
 *   /features/prism       智能写作(原 "Prism AI 写作")
 *   /features/claw        智能助手(原 "Claw AI 助手")
 *   /features/submit      智能投稿 ─┐ 都指向"智能审稿" feature
 *   /features/peer-review 同行评审 ─┘
 */
const SOLUTION_LINKS: { label: string; to: string; desc: string }[] = [
  { label: '文献搜索', to: '/features/search', desc: '全网检索文献与学者' },
  { label: '文件夹', to: '/features/library', desc: '收藏 / 分组 / 跨设备同步' },
  { label: '智能写作', to: '/features/prism', desc: '科研级 LaTeX 协作写作' },
  { label: '智能助手', to: '/features/claw', desc: '智能问答与对话' },
  { label: '智能投稿', to: '/features/submit', desc: '投稿前 AI 预审' },
  { label: '同行评审', to: '/features/peer-review', desc: '同行评审与意见沉淀' },
];

/** 法律 / 关于类链接 —— 路径与旧 frontend-user 保持一致(SEO 不丢);
 *  「定价」是未登录动线入口(/pricing 会员介绍页),与 LandingNav 的定价链接呼应 */
const BRAND_LINKS: { label: string; to: string }[] = [
  { label: '关于我们', to: '/about' },
  { label: '定价', to: '/pricing' },
  { label: '学术资源', to: '/resources' },
  { label: '帮助中心', to: '/help' },
  { label: '隐私政策', to: '/privacy' },
  { label: '服务条款', to: '/terms' },
];

export function Footer() {
  // ICP 备案号来自容器 env(ICP_BEIAN),未配置则不渲染该块 —— 见下方注释。
  const icp = icpBeian();
  return (
    <footer className="bg-background border-t border-border">
      {/*
       * 单行(≥1024)/ 自动换行(<1024):brand / 法律 + 解决方案 popover
       *
       * 🔴 窄屏破版修复(render-audit-2026-07-28 P1-1):此处曾是 `h-11` 定高 + 不换行的
       * 单行 flex。中文没有词边界 → 每个链接的 min-content 宽度 = **一个汉字**,flex 收缩时
       * 「关于我们」被压成 12.7px 宽 × 60px 高(4 行竖排),而父容器只有 44px 高 →
       * 内容被 h-11 直接裁掉(实测 390/414 下 row.scrollHeight=52 > clientHeight=44)。
       * 且 `html,body{overflow-x:hidden}` 让文档级溢出探针恒为 false,破版被静默吞掉。
       *
       * 三处修法(缺一不可):
       *   1. `whitespace-nowrap` —— 把每个链接的 min-content 从「一个汉字」抬到整词,
       *      这是「每行一个汉字」的直接根因;
       *   2. `flex-wrap` + `min-h-11`(替代 `h-11`)—— 放不下就换行,容器跟着长高不再裁;
       *   3. 分隔竖线 `lg:block` —— 换行时竖线会漂到行首,只在实测能单行放下的 ≥1024 才显示。
       * ≥1024 的渲染与修复前逐像素一致(min-h-11 + py-2 撑不满 44 → 仍是 44;gap-x-6 同 gap-6)。
       */}
      <div className="min-h-11 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-2 text-12 text-faint">
        <span className="whitespace-nowrap">
          © {new Date().getFullYear()} <BrandName tone="subtle" />
        </span>
        {BRAND_LINKS.map((l) => (
          <span key={l.label} className="flex shrink-0 items-center gap-6">
            <span className="hidden h-3.5 w-px bg-border-strong lg:block" />
            <Link
              to={l.to}
              className="whitespace-nowrap hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          </span>
        ))}

        <span className="flex shrink-0 items-center gap-6">
          <span className="hidden h-3.5 w-px bg-border-strong lg:block" />
          <PopoverPrimitive.Root>
            <PopoverPrimitive.Trigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 whitespace-nowrap hover:text-foreground transition-colors"
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
                className="z-popover w-64 rounded-12 border border-border bg-surface-card p-1.5"
              >
                <div className="flex flex-col">
                  {SOLUTION_LINKS.map((l) => (
                    <PopoverPrimitive.Close asChild key={l.to}>
                      <Link
                        to={l.to}
                        className="flex flex-col gap-0.5 px-2.5 py-2 rounded-8 hover:bg-surface-1 transition-colors text-left"
                      >
                        <span className="text-14 font-medium text-foreground">
                          {l.label}
                        </span>
                        <span className="text-12 text-muted-foreground">
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

        {/* ICP 备案 —— 中国大陆运营要求;同行尾部,链到工信部官方查询页。
            🔴 备案号与【已备案的域名】绑定,不是与代码绑定。以前这里是写死的字面量,
            意味着任何用这份代码部署的域名都会挂着同一个备案号 —— 未接入备案的站点
            公开展示它属于错挂,被举报或巡检时处理对象是**那条备案本身**(可能连累
            权威站被要求整改)。即使是同主体子域名也要各自接入。
            改为运行时注入(容器 env ICP_BEIAN → index.html 的 window.__SITE_CONFIG__),
            未配置则整块不渲染。 */}
        {icp && (
          <span className="flex shrink-0 items-center gap-6">
            <span className="hidden h-3.5 w-px bg-border-strong lg:block" />
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap hover:text-foreground transition-colors"
            >
              {icp}
            </a>
          </span>
        )}
      </div>
    </footer>
  );
}

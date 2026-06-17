import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, Copy, Monitor, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/shared/lib/clipboard';

/**
 * 移动端「该功能建议在电脑端使用」引导页 —— 对齐 scholay-mobile.pen `ZUouF`(智能审稿 / PC 引导)。
 * 站内纯 PC 能力(审稿/写作/矩阵)在移动端点开后到这里:说明手机受限 + 列出电脑端完整能力 +
 * 给出可复制的电脑端链接。配置驱动(PC_FEATURES),一份组件覆盖三个功能。
 */
interface PcFeature {
  name: string;
  title: string;
  desc: string;
  features: string[];
  path: string; // 电脑端路由
}

const PC_FEATURES: Record<string, PcFeature> = {
  'peer-review': {
    name: '智能审稿',
    title: '智能审稿建议在电脑端使用',
    desc: '完整审稿需要上传 PDF、逐段批注、多栏对照与导出,手机屏幕空间有限。前往电脑端可获得完整能力。',
    features: [
      '全文结构化预审与逻辑检查',
      '逐段修改意见与一键改写',
      '投稿期刊匹配与命中率预测',
      '格式 · 查重 · 参考文献核对',
    ],
    path: '/peer-review',
  },
  prism: {
    name: '智能写作',
    title: '智能写作建议在电脑端使用',
    desc: '论文写作涉及长文编辑、公式排版、插入引用与实时编译,手机小屏操作受限。前往电脑端体验完整写作环境。',
    features: [
      'AI 原生 LaTeX 写作编辑器',
      '内联修改建议与一键改写',
      '文献检索与一键插入引用',
      '实时编译预览与 PDF 导出',
    ],
    path: '/prism',
  },
  matrix: {
    name: '矩阵分析',
    title: '矩阵分析建议在电脑端使用',
    desc: '多文献矩阵对比需要宽屏表格、多维列对照与批量操作,手机屏幕难以铺开。前往电脑端使用完整能力。',
    features: [
      '多文献自定义维度对比',
      'AI 抽取方法 / 数据 / 结论',
      '矩阵表格横向对照查看',
      '一键导出对比结果',
    ],
    path: '/search',
  },
};

export function MobilePcOnlyPage() {
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const feature = key ? PC_FEATURES[key] : undefined;

  if (!feature) return <Navigate to="/m/tools" replace />;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://scholay.com';
  const fullUrl = `${origin}${feature.path}`;
  const displayUrl = fullUrl.replace(/^https?:\/\//, '');

  const copy = async () => {
    if (await copyToClipboard(fullUrl)) toast.success('已复制电脑端链接');
    else toast.error('复制失败,请手动复制');
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3.5">
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate('/m/tools')}
          className="flex size-9 items-center justify-center rounded-pill text-foreground active:bg-surface-2"
        >
          <ChevronLeft className="size-6" />
        </button>
        <span className="text-md font-semibold text-foreground">{feature.name}</span>
        <span className="size-9" aria-hidden />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-6">
        <div className="flex flex-col items-center gap-4">
          {/* Hero:显示器图标 + 「手机端功能受限」徽章 */}
          <div className="flex flex-col items-center gap-3">
            <span className="flex size-24 items-center justify-center rounded-full bg-[#F1EADA]">
              <Monitor className="size-11 text-foreground" strokeWidth={1.6} />
            </span>
            <span className="flex items-center gap-1.5 rounded-pill bg-surface-2 px-3 py-1.5">
              <Smartphone className="size-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">手机端功能受限</span>
            </span>
          </div>

          <h1 className="text-center text-xl font-semibold leading-snug text-foreground">{feature.title}</h1>
          <p className="text-center text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>

          {/* 电脑端可用 能力清单 */}
          <div className="w-full rounded-md border border-border bg-surface-1 p-4">
            <p className="mb-2.5 text-sm font-semibold text-foreground">电脑端可用</p>
            <ul className="flex flex-col gap-2.5">
              {feature.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="size-3.5 shrink-0 text-brand-green" />
                  <span className="text-sm text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 电脑端链接 + 复制 */}
          <div className="w-full rounded-md border border-border bg-background p-4">
            <div className="flex h-11 items-center justify-between gap-2 rounded-sm border border-border-button bg-surface-1 pl-3 pr-1.5">
              <span className="truncate text-sm text-muted-foreground">{displayUrl}</span>
              <button
                type="button"
                onClick={copy}
                className="flex shrink-0 items-center gap-1.5 rounded-sm border border-border-button bg-background px-3 py-1.5 active:bg-surface-2"
              >
                <Copy className="size-3.5 text-foreground" />
                <span className="text-xs font-semibold text-foreground">复制</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

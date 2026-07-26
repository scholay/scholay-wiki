import { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { Copy, ImageDown, Link2, Loader2, LogIn, MessageCircle, QrCode, Share2, ShieldCheck } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { MobileBottomSheet } from '@/shared/components/MobileBottomSheet';
import { isPhoneDevice } from '@/shared/lib/device';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import type { Paper, ShareTarget } from '@/shared/api/types';
import { ACCESS_TYPE_LABEL, PRICE_TYPE_LABEL } from '@/types/feature-tool';
import {
  buildShareText,
  paperToShareInput,
  useCreateShare,
  type CreatedShare,
} from '@/shared/api/library-share';
import { ShareCard, type ShareCardData } from './ShareCard';
import { SharePoster, type PosterPill, type SharePosterData } from './SharePoster';
import { CollectionSharePoster, type CollectionSharePosterData } from './CollectionSharePoster';

/** 期刊增强 → 海报排名胶囊(中科院 N 区实色 / JCR 描边 / IF 金色)。 */
function buildRankTags(j?: {
  jcr_quartile?: string;
  jcr_impact_factor?: number;
  fqb_quartile?: string;
  xr_quartile?: string;
} | null): PosterPill[] {
  if (!j) return [];
  const out: PosterPill[] = [];
  const cn = ['一', '二', '三', '四'];
  if (j.fqb_quartile) {
    const n = parseInt(j.fqb_quartile.replace(/\D/g, ''), 10);
    if (n >= 1 && n <= 4) out.push({ text: `中科院${cn[n - 1]}区`, tone: 'red' });
  }
  if (j.xr_quartile) {
    const n = parseInt(j.xr_quartile.replace(/\D/g, ''), 10);
    if (n >= 1 && n <= 4) out.push({ text: `新锐${cn[n - 1]}区`, tone: 'red' });
  }
  if (j.jcr_quartile) out.push({ text: `JCR ${j.jcr_quartile}`, tone: 'outline' });
  if (typeof j.jcr_impact_factor === 'number' && j.jcr_impact_factor > 0) {
    out.push({ text: 'IF', tone: 'outline', ifValue: j.jcr_impact_factor.toFixed(j.jcr_impact_factor >= 10 ? 1 : 2) });
  }
  return out;
}

// ShareTarget 现定义在 @/shared/api/types(分层:stores 不能引用 shared/components)。
// 仍从这里 re-export,旧的 `import { ShareTarget } from '.../ShareSheet'` 不受影响。
export type { ShareTarget };

const KIND_TITLE: Record<ShareTarget['kind'], string> = {
  single: '论文',
  journal: '期刊',
  collection: '文献集',
  tool: '功能',
};

const EXPIRY_OPTIONS = [
  { label: '永久', days: 0 },
  { label: '7 天', days: 7 },
  { label: '30 天', days: 30 },
];

export function ShareSheet({
  target,
  open,
  onOpenChange,
}: {
  target: ShareTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const titleText = `分享${target ? KIND_TITLE[target.kind] : ''}`;

  // 移动端:底部弹窗(拖拽下滑关闭 + 弹簧进退场);桌面:沿用右侧 shadcn Sheet。
  if (isPhoneDevice()) {
    return (
      <MobileBottomSheet open={open} onOpenChange={onOpenChange} title={titleText}>
        <div className="px-4 pb-2 pt-1">
          <h2 className="text-md font-semibold text-foreground">{titleText}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {target && <ShareBody key={shareTargetKey(target)} target={target} />}
        </div>
      </MobileBottomSheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0">
        <SheetHeader className="px-4 py-3 pr-10">
          <SheetTitle className="text-md">{titleText}</SheetTitle>
        </SheetHeader>
        {target && <ShareBody key={shareTargetKey(target)} target={target} />}
      </SheetContent>
    </Sheet>
  );
}

function shareTargetKey(t: ShareTarget): string {
  if (t.kind === 'single') return `single:${t.paper.paperId}`;
  if (t.kind === 'journal') return `journal:${t.journal.id}`;
  if (t.kind === 'tool') return `tool:${t.tool.id}`;
  return `coll:${t.folderId}`;
}

function authorsLine(p: Paper): string | undefined {
  const names = (p.authors ?? [])
    .map((a) => a.name?.trim())
    .filter((n): n is string => !!n);
  if (names.length === 0) return undefined;
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} 等 ${names.length} 人`;
}

/** 海报高亮条文案 —— 按引用量给出诚实的影响力标签(避免对低被引论文夸大)。 */
function citeHighlight(n: number): string | undefined {
  if (n <= 0) return undefined;
  const s = n.toLocaleString();
  if (n >= 10000) return `被引 ${s} · 领域高被引论文`;
  if (n >= 1000) return `被引 ${s} · 高被引论文`;
  if (n >= 100) return `被引 ${s} · 受关注研究`;
  return `累计被引 ${s} 次`;
}

function ShareBody({ target }: { target: ShareTarget }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const authenticated = useAuthStore((s) => !!s.token);
  const user = useAuthStore((s) => s.user); // 文献集海报「整理人」
  const cardRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const collectionPosterRef = useRef<HTMLDivElement>(null);

  const [withCode, setWithCode] = useState(true);
  const [expiryDays, setExpiryDays] = useState(0);
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const create = useCreateShare();

  // 分享 URL:单篇 / 期刊 / 文献集都走 /s/:token **短链**(create 后才有)→ 打开的是「被分享落地页」,
  // 而非详情页(期刊落地页也带分享人横幅 + 期刊卡 + 在 Scholay 打开)。
  // 功能/工具:公开页直链(无短链 token);其余走 /s/:token 短链(create 后才有)。
  const shareUrl =
    target.kind === 'tool'
      ? `${origin}/tools/${target.tool.slug || target.tool.id}`
      : created
        ? `${origin}/s/${created.token}`
        : '';
  const urlLabel = shareUrl ? shareUrl.replace(/^https?:\/\//, '') : 'scholay.com/s/…';

  // 单篇 / 期刊:登录态下进面板即自动生成短链(永久 / 无提取码),即用即分享,对齐设计(无「生成」步骤)。
  // 依赖 authenticated:面板内通过底部登录弹窗登录后,authenticated 翻 true → 这里补生成短链(只一次)。
  const autoRef = useRef(false);
  useEffect(() => {
    if (created || !authenticated || autoRef.current) return;
    if (target.kind === 'single') {
      autoRef.current = true;
      create.mutate(
        { kind: 'single', paper: paperToShareInput(target.paper), with_code: false, expires_in_days: 0 },
        { onSuccess: setCreated, onError: (e) => toast.error(toApiError(e).message || '生成分享链接失败') }
      );
    } else if (target.kind === 'journal') {
      autoRef.current = true;
      const j = target.journal;
      const typeLabel = j.type === 'conference' ? '会议' : j.type === 'journal' ? '期刊' : j.type;
      create.mutate(
        {
          kind: 'journal',
          journal_id: j.id,
          title: j.canonical_name,
          subtitle: [j.publisher, typeLabel, j.country].filter(Boolean).join(' · '),
        },
        { onSuccess: setCreated, onError: (e) => toast.error(toApiError(e).message || '生成分享链接失败') }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  // 篇目样本:优先用创建后服务端回传的快照(created.papers,权威且与任意入口无关),
  // 未创建时回落 caller 传的 target.samplePapers(仅作面板内预览卡用)。
  const collectionSamplePapers =
    target.kind === 'collection'
      ? created?.papers?.length
        ? created.papers.map((p) => ({ title: p.title, venue: p.venue, year: p.year }))
        : target.samplePapers
      : undefined;
  const sampleTitles = collectionSamplePapers?.map((p) => p.title);

  // 文献集「保存图片」富海报数据(对齐 .pen 文献集卡组);ShareCard 仍作面板内预览。
  // 导出按钮只在 created 后出现 → 这里也只在 created 后产数据(null 时不挂屏外海报),
  // QR 直接带提取码(与 ShareCard 一致,扫码免输码直达合集);不再有「未创建落首页」的兜底死路。
  // samplePapers 用 created.papers(服务端快照前 8 篇)→ 无论从文献集列表 / 集内 / PC 入口都能渲染前几篇。
  const collectionPosterData: CollectionSharePosterData | null = useMemo(() => {
    if (target.kind !== 'collection' || !created) return null;
    const qr = created.extract_code ? `${shareUrl}?code=${created.extract_code}` : shareUrl;
    return {
      title: created.title ?? target.folderName,
      paperCount: created.paper_count ?? target.paperCount,
      samplePapers: collectionSamplePapers,
      curatorName: user?.username || undefined,
      curatorYear: new Date().getFullYear(),
      qrValue: qr,
      urlLabel,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, created, shareUrl, urlLabel, user, collectionSamplePapers]);

  const cardData: ShareCardData = useMemo(() => {
    if (target.kind === 'single') {
      const p = target.paper;
      const tags = [
        [p.venue, p.year].filter(Boolean).join(' · '),
        p.isOpenAccess ? '开放获取' : '',
      ].filter(Boolean) as string[];
      return {
        kind: 'single',
        title: p.title ?? '未命名论文',
        tags,
        authors: authorsLine(p),
        metric: p.citationCount != null ? `被引 ${p.citationCount.toLocaleString()}` : undefined,
        paperCount: 1,
        qrValue: shareUrl || origin,
        urlLabel,
      };
    }
    if (target.kind === 'journal') {
      const j = target.journal;
      const typeLabel = j.type === 'conference' ? '会议' : j.type === 'journal' ? '期刊' : j.type;
      return {
        kind: 'journal',
        title: j.canonical_name,
        subtitle: [j.publisher, typeLabel, j.country].filter(Boolean).join(' · '),
        journalRank: j,
        paperCount: 1,
        qrValue: shareUrl,
        urlLabel,
      };
    }
    if (target.kind === 'tool') {
      const t = target.tool;
      return {
        kind: 'tool',
        title: t.name,
        subtitle: t.tagline || undefined,
        tags: [
          t.category_label,
          t.price_type ? PRICE_TYPE_LABEL[t.price_type] ?? t.price_type : '',
        ].filter(Boolean) as string[],
        paperCount: 1,
        qrValue: shareUrl,
        urlLabel,
      };
    }
    const qr = created ? (created.extract_code ? `${shareUrl}?code=${created.extract_code}` : shareUrl) : origin;
    return {
      kind: 'collection',
      title: created?.title ?? target.folderName,
      subtitle: `${target.paperCount} 篇文献`,
      paperCount: created?.paper_count ?? target.paperCount,
      sampleTitles,
      qrValue: qr,
      urlLabel: created ? urlLabel : 'scholay.com/s/…',
    };
  }, [target, created, origin, shareUrl, urlLabel, sampleTitles]);

  // 单篇/期刊「保存图片」导出富海报(SharePoster);文献集仍导出预览卡(ShareCard,堆叠封面)。
  const posterData: SharePosterData | null = useMemo(() => {
    if (target.kind === 'single') {
      const p = target.paper;
      const n = p.citationCount;
      const venueYear = [p.venue, p.year].filter(Boolean).join(' ');
      const pills: PosterPill[] = [];
      if (p.venue) pills.push({ text: p.venue, tone: 'muted' });
      if (n != null && n > 0) pills.push({ text: `被引 ${n.toLocaleString()}`, tone: 'red', cite: true });
      return {
        kindLabel: '论文名片',
        icon: 'paper',
        title: p.title ?? '未命名论文',
        quoteTitle: true,
        metaLine: [venueYear, authorsLine(p)].filter(Boolean).join(' · ') || undefined,
        pills: pills.length ? pills : undefined,
        blurb: p.abstract || undefined,
        highlight: n != null ? citeHighlight(n) : undefined,
        qrValue: shareUrl || origin,
        scanLabel: '长按识别二维码 · 在 Scholay 查看全文',
        urlLabel,
      };
    }
    if (target.kind === 'journal') {
      const j = target.journal;
      const typeLabel = j.type === 'conference' ? '会议' : j.type === 'journal' ? '期刊' : j.type;
      const highlight =
        typeof j.jcr_impact_factor === 'number' && j.jcr_impact_factor > 0
          ? `影响因子 ${j.jcr_impact_factor.toFixed(j.jcr_impact_factor >= 10 ? 1 : 2)}`
          : j.openalex_h_index != null
            ? `h-index ${j.openalex_h_index}`
            : undefined;
      return {
        kindLabel: '期刊名片',
        icon: 'journal',
        title: j.canonical_name,
        metaLine: [j.publisher, typeLabel, j.country].filter(Boolean).join(' · ') || undefined,
        pills: buildRankTags(j),
        highlight,
        qrValue: shareUrl,
        scanLabel: '长按识别二维码 · 在 Scholay 查看期刊',
        urlLabel,
      };
    }
    if (target.kind === 'tool') {
      const t = target.tool;
      const pills: PosterPill[] = [];
      if (t.category_label) pills.push({ text: t.category_label, tone: 'muted' });
      if (t.price_type) pills.push({ text: PRICE_TYPE_LABEL[t.price_type] ?? t.price_type, tone: 'muted' });
      if (t.access_type) pills.push({ text: ACCESS_TYPE_LABEL[t.access_type as keyof typeof ACCESS_TYPE_LABEL] ?? t.access_type, tone: 'muted' });
      return {
        kindLabel: '功能名片',
        icon: 'tool',
        title: t.name,
        metaLine: t.category_label || undefined,
        pills: pills.length ? pills : undefined,
        blurb: t.tagline || undefined,
        highlight: '已收录于 Scholay 全网科研导航',
        qrValue: shareUrl,
        scanLabel: '长按识别二维码 · 在 Scholay 体验功能',
        urlLabel,
      };
    }
    return null; // 文献集走 ShareCard 导出
  }, [target, shareUrl, urlLabel, origin]);

  const copy = async (text: string, label: string) => {
    if (await copyToClipboard(text)) toast.success(`${label}已复制`);
    else toast.error('复制失败,请手动选择复制');
  };

  const saveImage = async () => {
    // 导出目标:文献集 → 富海报 CollectionSharePoster;单篇/期刊/功能 → SharePoster;兜底 → ShareCard。
    const node = collectionPosterData
      ? collectionPosterRef.current
      : posterData
        ? posterRef.current
        : cardRef.current;
    if (!node) return;
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `scholay-share-${created?.token ?? 'card'}.png`;
      a.click();
      toast.success('分享图已保存');
    } catch {
      toast.error('生成分享图失败');
    }
  };

  // 「分享到微信」/「微信」渠道:有原生分享面板(移动端,含微信)就唤起,否则复制链接提示去微信粘贴。
  const shareDirect = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: cardData.title, url: shareUrl });
      } catch {
        /* 用户取消分享 */
      }
      return;
    }
    if (await copyToClipboard(shareUrl)) toast.success('已复制链接,粘贴到微信发给好友');
    else toast.error('复制失败,请手动复制');
  };

  const handleCreate = () => {
    if (target.kind !== 'collection') return;
    create.mutate(
      { kind: 'collection', folder_id: target.folderId, with_code: withCode, expires_in_days: expiryDays },
      {
        onSuccess: setCreated,
        onError: (e) => toast.error(toApiError(e).message || '生成分享失败'),
      }
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 预览卡(文献集的分享图导出目标;单篇/期刊预览也用它,导出走下方屏外 SharePoster) */}
      <ShareCard ref={cardRef} data={cardData} />

      {/* 屏外渲染的「保存图片」富海报(单篇/期刊/功能)——html-to-image 的真正导出目标 */}
      {posterData && (
        <div aria-hidden className="pointer-events-none fixed left-[-9999px] top-0">
          <SharePoster ref={posterRef} data={posterData} />
        </div>
      )}
      {/* 文献集富海报(屏外导出目标);面板内预览仍是上面的 ShareCard。 */}
      {collectionPosterData && (
        <div aria-hidden className="pointer-events-none fixed left-[-9999px] top-0">
          <CollectionSharePoster ref={collectionPosterRef} data={collectionPosterData} />
        </div>
      )}

      {target.kind === 'tool' || ((target.kind === 'single' || target.kind === 'journal') && created) ? (
        <>
          <div>
            <p className="mb-2 text-xs text-faint">分享到</p>
            <div className="grid grid-cols-4 gap-2">
              <ChannelBtn icon={<MessageCircle className="size-5" />} label="微信" onClick={shareDirect} />
              <ChannelBtn icon={<Link2 className="size-5" />} label="复制链接" onClick={() => copy(shareUrl, '链接')} />
              <ChannelBtn icon={<ImageDown className="size-5" />} label="保存图片" onClick={saveImage} />
              <ChannelBtn icon={<QrCode className="size-5" />} label="二维码" onClick={() => toast.message('二维码已在上方卡片,长按或保存图片即可')} />
            </div>
          </div>
          <Button onClick={shareDirect} className="h-11">
            <Share2 className="size-4" />
            分享到微信
          </Button>
          <p className="text-center text-2xs leading-paragraph text-faint">
            {target.kind === 'tool'
              ? '对方打开即可在 Scholay 体验该功能,无需登录'
              : `对方点开短链即可在 Scholay 查看${target.kind === 'single' ? '并收藏' : ''},无需登录`}
          </p>
        </>
      ) : (target.kind === 'single' || target.kind === 'journal') && !authenticated ? (
        <>
          <Button onClick={() => useAuthDialog.getState().openDialog('login')} className="h-11">
            <LogIn className="size-4" />
            登录后生成分享链接
          </Button>
          <p className="text-center text-2xs leading-paragraph text-faint">
            生成专属短链后,对方打开即可查看这{target.kind === 'single' ? '篇论文' : '个期刊'}
          </p>
        </>
      ) : target.kind === 'single' || target.kind === 'journal' ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-faint">
          <Loader2 className="size-4 animate-spin" />
          正在生成分享链接…
        </div>
      ) : !created ? (
        <>
          <div className="flex flex-col gap-3 rounded-12 border border-border bg-surface-1 p-3">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-subtle">
                <ShieldCheck className="size-4" /> 提取码保护(防盗链)
              </span>
              <Switch checked={withCode} onCheckedChange={setWithCode} />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-sm text-subtle">有效期</span>
              <div className="flex gap-1.5">
                {EXPIRY_OPTIONS.map((o) => (
                  <button
                    key={o.days}
                    type="button"
                    onClick={() => setExpiryDays(o.days)}
                    className={`rounded-8 border px-2.5 py-1 text-xs ${
                      expiryDays === o.days
                        ? 'border-brand-red bg-danger-soft text-brand-red'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={create.isPending} className="h-11">
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            生成分享链接
          </Button>
        </>
      ) : (
        <>
          {created.extract_code && (
            <div className="flex items-center justify-between rounded-12 border border-border bg-surface-1 px-3 py-2.5">
              <span className="text-sm text-subtle">提取码</span>
              <span className="font-mono text-lg font-bold tracking-code text-brand-red">
                {created.extract_code}
              </span>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs text-faint">分享渠道</p>
            <div className="grid grid-cols-4 gap-2">
              <ChannelBtn icon={<Link2 className="size-5" />} label="复制链接" onClick={() => copy(`${origin}/s/${created.token}`, '链接')} />
              <ChannelBtn icon={<Copy className="size-5" />} label="复制口令" onClick={() => copy(buildShareText({ token: created.token, title: created.title, paper_count: created.paper_count, extract_code: created.extract_code }, origin), '口令')} />
              <ChannelBtn icon={<ImageDown className="size-5" />} label="保存图片" onClick={saveImage} />
              <ChannelBtn icon={<QrCode className="size-5" />} label="二维码" onClick={() => toast.message('二维码已展示在上方卡片,长按或保存图片即可')} />
            </div>
          </div>
          <p className="text-2xs leading-paragraph text-faint">
            「复制口令」是纯文本(链接+提取码),在微信/微博等渠道不易被屏蔽;对方在浏览器打开链接、输入提取码即可查看并一键转存。
          </p>
        </>
      )}
    </div>
  );
}

function ChannelBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-8 border border-border bg-surface-card py-2.5 text-muted-foreground active:bg-surface-2"
    >
      {icon}
      <span className="text-2xs text-subtle">{label}</span>
    </button>
  );
}

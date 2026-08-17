import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileBarChart, Layout, Loader2, PenTool, Presentation, Sparkles } from 'lucide-react';
import { RhinoBrandIcon } from '@/shared/components/RhinoBrandIcon';
import { resolveAgentSessionQuery } from '@/shared/api/agent-sessions';
import { ResourceError } from '@/shared/components/ResourceError';
import { type ClawArtifact } from '../api/artifacts';
import { clawHeroDefaults } from '../components/chat/ClawHero';
import {
  ConversationWorkspace,
  type WorkspaceConfig,
} from '../components/chat/ConversationWorkspace';
import { TemplateCards, type TemplateFeature } from '../components/chat/TemplateCards';
import { FEATURE_ICON } from '../lib/feature-meta';
import { useClawConversation } from '../hooks/useClawConversation';
import { getNewConversationModel, setNewConversationModel } from '../api/session';
import { useBoltslidesConversation } from '../hooks/useBoltslidesConversation';
import {
  getBoltslidesNewConversationModel,
  setBoltslidesNewConversationModel,
  useExportBoltslidesDeck,
  type DeckExportFormat,
} from '../api/boltslides-session';
import { useSciDrawConversation } from '../hooks/useSciDrawConversation';
import {
  getSciDrawNewConversationModel,
  setSciDrawNewConversationModel,
} from '../api/sci-draw-session';

/**
 * 智能助手主页(桌面) —— 路由 `/claw`。
 *
 * 「制作PPT」不再是与「对话」并列的顶部 tab,而是**统一对话里的一个可套用模板**:
 *   - 默认就是普通聊天(claw / useClawConversation → /user/claw)
 *   - 新对话空态下,composer 下方铺开「模板卡扑克牌扇」;选「制作PPT」→ 切到 boltslides 模板
 *     (useBoltslidesConversation → /user/boltslides,产出单文件 HTML 演示稿),空态提供「换回对话」
 *   - 会话切换走全站左轨「对话」段;主区不再挂 AgentSessionStrip
 *
 * 每个 feature 是一个自包含 workspace(各调各的 hook,满足 hooks 规则),共享 ConversationWorkspace 布局。
 *
 * 【会话路由化 2026-07】真源改为 **URL**:
 *   - `/claw`(无 sessionId)→ **永远是全新对话**(不再自动续接上次会话)。用哪个 feature 由内部态
 *     `newFeature` 决定(默认 claw,模板卡可切),因新对话尚无 sessionId、URL 编不进 feature。
 *   - `/claw/:sessionId` → 深链/刷新到某会话:先调 `resolveAgentSessionQuery` 反查它的 feature + 归属
 *     (后端 /user/agent-session/resolve),**不属于我/不存在 → 302 回 /claw 新对话**(鉴权 + goal 4)。
 *   - 点侧栏某会话 = `navigate('/claw/:sid')`;新对话/切模板 = `navigate('/claw')`。remount 由 workspace 的
 *     React key 驱动(会话态 key=`feature:sid`,新对话态 key=`new:N`)。
 *   - **懒新建回填**:新对话发首条消息落地真 sessionId 时,hook 回调 `onSessionCreated` → 页层
 *     `navigate('/claw/:newId', {replace})`,但用 `ownRef` 识别这是「自己刚建的 id」→ **不 remount**
 *     (否则打断正在流式的回答)。
 */

const CLAW_CFG: WorkspaceConfig = {
  title: '智能助手',
  titleIcon: RhinoBrandIcon,
  modelFeature: 'claw',
  newConvModel: { get: getNewConversationModel, set: setNewConversationModel },
  artifactBasePath: '/user/claw',
  hero: clawHeroDefaults,
  layoutKey: 'claw',
  // 统一历史:两 feature 共用同一段 id(收起态 rail chip 定位到它)。
  railSectionId: 'workspace',
  railLabel: '工作区',
};

const PPT_CFG: WorkspaceConfig = {
  title: '制作PPT',
  titleIcon: Presentation,
  modelFeature: 'boltslides',
  newConvModel: { get: getBoltslidesNewConversationModel, set: setBoltslidesNewConversationModel },
  artifactBasePath: '/user/boltslides',
  hero: {
    title: '制作PPT · 演示稿',
    subtitle: '描述你的主题 / 品牌,我来生成一份可交互的网页演示稿(可预览、可下载)',
    suggestions: [
      { icon: Presentation, label: '做个 pitch deck', prompt: '帮我做一份 8-12 页的 pitch deck,主题是「一个用 AI 辅助文献综述的科研工具」' },
      { icon: Layout, label: '课程讲义', prompt: '帮我做一份讲「Transformer 注意力机制」的教学演示稿,面向研究生,约 10 页' },
      { icon: FileBarChart, label: '汇报稿', prompt: '帮我做一份季度进展汇报演示稿,含目标、进度、数据、下一步,风格简洁专业' },
    ],
  },
  emptyArtifactsHint: '生成的演示稿会出现在这里',
  autoOpenLatestArtifact: true, // deck 产出后自动打开右侧预览 + 生成中轮询产物(即时露出成果)
  enableAttachments: false, // 制作PPT 纯文本描述主题;无上传/引用端点(见 boltslides skill)
  composerPlaceholder: '描述你要做的演示稿(主题 / 品牌 / 受众 / 页数)· Enter 发送 / Shift+Enter 换行',
  layoutKey: 'boltslides',
  railSectionId: 'workspace',
  railLabel: '工作区',
};

const SCI_DRAW_CFG: WorkspaceConfig = {
  title: '科研绘图',
  titleIcon: FEATURE_ICON.sci_draw, // 与模板卡 / 会话历史徽标同步(单一真源,换图标只改一处)
  modelFeature: 'sci_draw',
  newConvModel: { get: getSciDrawNewConversationModel, set: setSciDrawNewConversationModel },
  artifactBasePath: '/user/sci_draw',
  hero: {
    title: '科研绘图 · 矢量图',
    subtitle: '用一句话描述你要的图,我生成一张论文级原创矢量图,直接在对话里展示,可下载 SVG/PNG',
    suggestions: [
      { icon: PenTool, label: '实验流程图', prompt: '帮我画一张论文实验流程图:数据收集 → 预处理 → 模型训练 → 评估 → 结果分析,方框加箭头,风格简洁专业' },
      { icon: Layout, label: '模型结构图', prompt: '帮我画一张 Transformer 编码器结构示意图:输入嵌入、多头注意力、前馈网络、残差与层归一化,标注清楚' },
      { icon: Sparkles, label: '机制示意图', prompt: '帮我画一张信号通路示意图:受体 → 激活 → 级联反应 → 转录因子 → 基因表达,用节点和带箭头的连线' },
    ],
  },
  figuresInline: true, // 图直接内联展示在对话流里,不走右侧文档扩展区、不出文件卡
  enableAttachments: false, // P0 纯文本描述 → 生成矢量图;无上传/引用端点(见 sci-draw skill)
  composerPlaceholder: '描述你要画的图(类型 / 要素 / 关系 / 风格)· Enter 发送 / Shift+Enter 换行',
  layoutKey: 'sci_draw',
  railSectionId: 'workspace',
  railLabel: '工作区',
};

/** 页层注入 workspace 的公共 props。 */
interface WorkspacePageProps {
  /** 初始会话意图:null=空白新对话 | string=激活该会话(来自 URL /claw/:sessionId)。 */
  seed: string | null;
  /** 懒新建落地真 sessionId 时回调 → 页层回填 URL(/claw/:newId)。 */
  onSessionCreated: (sessionId: string) => void;
  /** 新对话(回到 /claw 空白态)。 */
  onNewConversation: () => void;
  /** 选模板卡切 feature(仍是新对话态)。 */
  onPickTemplate: (feature: TemplateFeature) => void;
  /** 首页等入口带过来的首条草稿(?q=),仅空态预填。 */
  initialPrompt?: string;
  onInitialPromptConsumed?: () => void;
}

function ClawModeWorkspace({
  seed,
  onSessionCreated,
  onNewConversation,
  onPickTemplate,
  initialPrompt,
  onInitialPromptConsumed,
}: WorkspacePageProps) {
  const conv = useClawConversation({ initialSessionId: seed, onSessionCreated });
  const heroExtra = <TemplateCards activeFeature="claw" onPick={onPickTemplate} />;
  return (
    <ConversationWorkspace
      conv={conv}
      cfg={CLAW_CFG}
      heroExtra={heroExtra}
      onNewConversation={onNewConversation}
      initialPrompt={initialPrompt}
      onInitialPromptConsumed={onInitialPromptConsumed}
    />
  );
}

function PptModeWorkspace({ seed, onSessionCreated, onNewConversation, onPickTemplate }: WorkspacePageProps) {
  const conv = useBoltslidesConversation({ initialSessionId: seed, onSessionCreated });
  const exportDeck = useExportBoltslidesDeck();
  const handleExportDeck = useCallback(
    (a: ClawArtifact, format: DeckExportFormat) => {
      if (!conv.sessionId) {
        toast.error('请先生成演示稿');
        return;
      }
      const label = format === 'pdf' ? 'PDF' : format === 'pptx-native' ? '可编辑 PPT' : '图片版 PPT';
      exportDeck.mutate(
        { sessionId: conv.sessionId, path: a.path, format },
        {
          onSuccess: (r) => {
            const note =
              format === 'pptx-native'
                ? '(文字/表格/图表可编辑;复杂图为图片)'
                : format === 'pptx'
                  ? '(图片版·不可再编辑文字)'
                  : '';
            toast.success(`已导出并下载 ${r.slides} 页 ${label}${note} · 见浏览器下载目录`);
          },
          onError: (e) => toast.error(e.message || `导出 ${label} 失败,请稍后重试`),
        },
      );
    },
    [conv.sessionId, exportDeck],
  );
  // 正在导出的格式(给按钮显示 spinner + 互斥禁用);mutation 空闲时为 null。
  const exportingFormat: DeckExportFormat | null = exportDeck.isPending
    ? exportDeck.variables?.format ?? 'pptx'
    : null;
  const heroExtra = <TemplateCards activeFeature="boltslides" onPick={onPickTemplate} />;
  return (
    <ConversationWorkspace
      conv={conv}
      cfg={PPT_CFG}
      heroExtra={heroExtra}
      onNewConversation={onNewConversation}
      onExportArtifactDeck={handleExportDeck}
      exportingFormat={exportingFormat}
    />
  );
}

function SciDrawModeWorkspace({ seed, onSessionCreated, onNewConversation, onPickTemplate }: WorkspacePageProps) {
  const conv = useSciDrawConversation({ initialSessionId: seed, onSessionCreated });
  const heroExtra = <TemplateCards activeFeature="sci_draw" onPick={onPickTemplate} />;
  return (
    <ConversationWorkspace
      conv={conv}
      cfg={SCI_DRAW_CFG}
      heroExtra={heroExtra}
      onNewConversation={onNewConversation}
    />
  );
}

/** 智能助手页只承载这三个 feature;resolve 出别的(smart_search/prism…)当不可见 → 回新对话。 */
const PAGE_FEATURES: readonly TemplateFeature[] = ['claw', 'boltslides', 'sci_draw'];

function parseFeatureParam(raw: string | null): TemplateFeature | null {
  if (raw === 'claw' || raw === 'boltslides' || raw === 'sci_draw') return raw;
  return null;
}

type Mode =
  | { kind: 'new' } // 新对话:feature 由 newFeature 决定
  | { kind: 'session'; feature: TemplateFeature; sessionId: string };

export function ClawPage() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPrompt = searchParams.get('q')?.trim() || undefined;
  const featureFromUrl = parseFeatureParam(searchParams.get('feature'));

  const consumeInitialPrompt = useCallback(() => {
    if (!searchParams.has('q')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // 新对话(尚无 sessionId,URL 只能是 /claw)用哪个 feature —— 内部态,模板卡可切;默认 claw。
  // 首页模板卡经 ?feature=boltslides|sci_draw 落地,首帧读入后抹掉 query 避免刷新残留。
  const [newFeature, setNewFeature] = useState<TemplateFeature>(() => featureFromUrl ?? 'claw');
  const [newKey, setNewKey] = useState(0); // 新对话 workspace 的 remount 计数(切模板/点新对话都 +1)

  useEffect(() => {
    if (!featureFromUrl) return;
    setNewFeature(featureFromUrl);
    const next = new URLSearchParams(searchParams);
    next.delete('feature');
    setSearchParams(next, { replace: true });
  }, [featureFromUrl, searchParams, setSearchParams]);
  // 已「落定」的挂载态(new / session)。深链首帧尚未解析出 feature → null(整页转圈)。切会话时**不**清成
  // null —— 保留上一个 workspace(含侧栏)直到新会话解析完再原子切换,避免每次切会话整页闪 spinner。
  const [mode, setMode] = useState<Mode | null>(() => (urlSessionId ? null : { kind: 'new' }));
  const [resolveError, setResolveError] = useState<unknown>(null); // 解析失败(网络/5xx)→ 可重试
  const [resolveNonce, setResolveNonce] = useState(0); // 重试:bump 一次重跑解析 effect

  // 已挂载 workspace 拥有的 sessionId(null=新对话尚未落地)。用来把「首条消息落地新 id 后回填 URL」
  // 的 echo 与「真正切到别的会话」区分开:echo 不该 remount(否则打断流式回答)。初值 null:即便深链
  // 带 id,本次 mount 也还没「拥有」它 → 走解析挂载;只有本页自己 onSessionCreated 落地的才算拥有。
  const ownRef = useRef<string | null>(null);

  // URL sessionId 变化 → 决定挂什么。
  useEffect(() => {
    const target = urlSessionId ?? null;
    // 已经拥有这个 id(首条消息落地后回填的 URL,或本就在看它)→ 不 remount、不重解析。
    if (target !== null && target === ownRef.current) return;
    if (target === null) {
      ownRef.current = null;
      setResolveError(null);
      setMode((m) => (m && m.kind === 'new' ? m : { kind: 'new' }));
      return;
    }
    // 深链/切会话:先解析 feature + 归属,再决定挂哪个 workspace。解析期间**保留** mode(旧 workspace),
    // 仅深链首帧(mode 尚 null)才是整页 spinner。
    let cancelled = false;
    setResolveError(null);
    queryClient
      .fetchQuery(resolveAgentSessionQuery(target))
      .then((res) => {
        if (cancelled) return;
        if (!res.owned || !PAGE_FEATURES.includes(res.feature as TemplateFeature)) {
          // 不存在 / 不属于我 / 非本页 feature → 回新对话(URL 掉 id)。
          ownRef.current = null;
          navigate('/claw', { replace: true });
          return;
        }
        ownRef.current = target;
        setMode({ kind: 'session', feature: res.feature as TemplateFeature, sessionId: target });
      })
      .catch((err) => {
        // 解析失败(网络/5xx,非 404 —— 后端 not-found/not-owned 走 200 owned:false 上面已处理):
        // 不静默把用户踢出合法会话,给可重试错误态(与移动端 history 404 只跳、5xx 重试对齐)。
        if (cancelled) return;
        setResolveError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [urlSessionId, navigate, queryClient, resolveNonce]);

  // 首条消息把会话落地成真 id → 回填 URL(replace、不 remount:ownRef 让 effect 认出这是自己建的 id)。
  // 注:若 createSession 在途期间用户已切走,hook 侧 mountedRef 已丢弃这条回调,不会走到这里。
  const handleSessionCreated = useCallback(
    (id: string) => {
      ownRef.current = id;
      navigate(`/claw/${id}`, { replace: true });
    },
    [navigate],
  );

  // 点侧栏某会话 → 导航到它的会话路由(effect 解析 feature 后挂载)。

  // 新对话 / 切模板:回到 /claw 无 id 的新对话态;feature 由内部态决定(模板卡可切)。
  const gotoNew = useCallback(
    (feature: TemplateFeature) => {
      setNewFeature(feature);
      setNewKey((k) => k + 1); // 即使已在 /claw、URL 不变,也靠 newKey 变化强制 remount 出全新对话
      ownRef.current = null;
      setResolveError(null);
      setMode({ kind: 'new' });
      if (urlSessionId) navigate('/claw'); // 从某会话切回:掉 id(effect 命中已是 'new',幂等)
    },
    [navigate, urlSessionId],
  );

  const resetToDefault = useCallback(() => gotoNew('claw'), [gotoNew]);

  // 解析失败(网络/5xx)→ 可重试错误态(不把用户从合法会话里踢出去、也不抹掉 /claw/:id URL)。
  if (resolveError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ResourceError
          error={resolveError}
          resourceName="对话"
          onRetry={() => {
            setResolveError(null);
            setResolveNonce((n) => n + 1);
          }}
          onBack={resetToDefault}
          backLabel="开始新对话"
          autoRedirect={false}
        />
      </div>
    );
  }

  // 深链首帧、尚无任何 workspace 可保留 → 整页转圈(切会话时 mode 非 null,不会走这里,侧栏不闪)。
  if (!mode) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-faint" />
      </div>
    );
  }

  const feature = mode.kind === 'session' ? mode.feature : newFeature;
  const seed = mode.kind === 'session' ? mode.sessionId : null;
  // 会话态 key=feature:sid(换会话就 remount);新对话态 key=new:N(切模板/点新对话就 remount)。
  const key = mode.kind === 'session' ? `${mode.feature}:${mode.sessionId}` : `new:${newKey}`;

  const pageProps: WorkspacePageProps = {
    seed,
    onSessionCreated: handleSessionCreated,
    onNewConversation: resetToDefault,
    onPickTemplate: gotoNew,
    initialPrompt,
    onInitialPromptConsumed: consumeInitialPrompt,
  };
  if (feature === 'boltslides') return <PptModeWorkspace key={key} {...pageProps} />;
  if (feature === 'sci_draw') return <SciDrawModeWorkspace key={key} {...pageProps} />;
  return <ClawModeWorkspace key={key} {...pageProps} />;
}

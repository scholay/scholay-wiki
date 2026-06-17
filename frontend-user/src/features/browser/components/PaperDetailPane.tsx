import { useEffect, useMemo, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import type { TranslatePaperResult } from '@/shared/api/translate';
import { trackPaperSeoView } from '@/shared/api/hot-content';
import {
  paperTabKey,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import type {
  Paper,
  PaperSource,
  UserLibraryPaper,
} from '@/shared/api/types';
// 跨 feature import —— 详情面板天然需要 library 的"是否已收藏 / 是否上传过 PDF"
// 上下文,是 browser ⇄ library 设计上的交叉点,违反"feature 互不 import"约束
// 是有意识的折衷;以后若 PaperDetailPane 进一步抽离再考虑提到 shared/api
import { useFetchPaperDetail } from '@/features/library/api/paper-detail';
import {
  libraryRowToPaper,
  useLibraryPaperByUpstream,
} from '@/features/library/api/papers';
import { PaperHeader } from './paper-detail/PaperHeader';
import { PaperAbstract } from './paper-detail/PaperAbstract';
import { PaperReferences } from './paper-detail/PaperReferences';
import { PaperFooter } from './paper-detail/PaperFooter';

/**
 * 论文详情面板 —— 浏览器 pane 主内容,设计稿 .pen `n2WkyU`(论文详情页)。
 *
 * 视觉走"编辑器/期刊版面"路线(880 居中,Playfair 大标题,Inter 正文 lh 1.75
 * justified),与列表卡的"工具感"分明。
 *
 * 路由层职责(本文件):
 *   - 解析 URL → 拿 paper(优先 tab store → fallback 拉接口 → local 自由文件转 paper)
 *   - 解析 libRow(收藏 / 上传 PDF 状态)
 *   - loading / error / paper 三态守门
 *
 * 视图层(PaperDetailView)按段拆到 `paper-detail/`:
 *   ┌─ ViewTabs(详情 / PDF 切换,仅有 PDF 时显示)
 *   ├─ PaperHeader(metaRow + 大标题 + 作者 + metadata + actionRow)
 *   ├─ PaperAbstract(italic 标题 + justified 正文 + Keywords)
 *   ├─ PaperReferences(REFERENCES + 列表 / 加载 / 空 / 错误)
 *   └─ PaperFooter(引用本文 + BibTeX box + 讨论占位 + meta)
 */

export function PaperDetailPane() {
  const match = useMatch('/paper/:source/:paperId');
  // source 可能是 stc/olx/pmd(上游)或 local(自由文件);PaperSource 包两类
  const source = match?.params.source as PaperSource | undefined;
  const paperId = match?.params.paperId
    ? decodeURIComponent(match.params.paperId)
    : '';
  const tabId = source && paperId ? paperTabKey(source, paperId) : '';
  const isLocal = source === 'local';

  const tab = useBrowserTabs((s) => {
    const t = s.tabs.find((t) => t.id === tabId);
    return t && t.kind === 'paper' ? t : undefined;
  });
  const openPaperTab = useBrowserTabs((s) => s.openPaperTab);

  // 上游论文走原有 fallback —— 自由文件跳过(没法去公共接口拿,会 404)。
  // 把 source 显式 narrow 到 UpstreamSource(`'local'` 时不会进入这条分支,
  // 但 useFetchPaperDetail 类型层不允许 'local',兜底成 'stc' 仅占位,enabled=false)
  const upstreamSource = !source || source === 'local' ? 'stc' : source;
  const needsFetch = !isLocal && (!tab || !tab.paper.abstract);
  const fallback = useFetchPaperDetail({
    source: upstreamSource,
    paperId,
    enabled: needsFetch && !!source && !!paperId,
  });

  // 用户文献集行 —— 任何 source(stc/olx/pmd/local)都查。
  // - 上游论文:决定"是否已收藏 + 是否上传过 PDF",ActionRow 用
  // - 自由文件:本就是数据源,paper 整个由 libraryRowToPaper 转出
  const libRowQ = useLibraryPaperByUpstream(source, paperId);
  const libRow = libRowQ.data ?? null;
  const localPaper = useMemo(
    () => (isLocal && libRow ? libraryRowToPaper(libRow) : undefined),
    [isLocal, libRow]
  );

  useEffect(() => {
    if (fallback.data && source) {
      openPaperTab(fallback.data, tab?.returnTo ?? '/library');
    }
  }, [fallback.data, tab?.returnTo, source, openPaperTab]);

  // 热门内容「SEO 直访量」上报 —— 论文页作为站外落地入口(冷进入)被打开时报一次。
  // 冷进入判定 = mount 时 browser-tabs(持久化在 localStorage)里没有该 paper 的 tab:
  //   - 站内点开: useOpenPaperInBrowser 先建 tab 再 navigate, mount 时 tab 已在 → 非冷进入
  //     (该路径的点击已由 useOpenPaperInBrowser → trackPaperClick 上报, 这里不重复)
  //   - 刷新自己的页: tab 持久化仍在 → 非冷进入 (不把刷新算成 SEO 直访)
  //   - SEO / 分享链接 / 站外直达: 无持久化 tab → 冷进入 → 报 seo_view
  const coldEntryRef = useRef(!tab && !isLocal && !!source && !!paperId);
  const seoViewReportedRef = useRef(false);
  useEffect(() => {
    if (seoViewReportedRef.current || !coldEntryRef.current) return;
    if (fallback.data) {
      seoViewReportedRef.current = true;
      trackPaperSeoView(fallback.data);
    }
  }, [fallback.data]);

  // 自由文件:把 libraryRow → Paper 也灌进 tabs,这样左侧 tab 标题等能正确显示
  useEffect(() => {
    if (localPaper && source) {
      openPaperTab(localPaper, tab?.returnTo ?? '/library');
    }
  }, [localPaper, tab?.returnTo, source, openPaperTab]);

  const paper = tab?.paper ?? fallback.data ?? localPaper;

  if (!paper) {
    const loading = isLocal ? libRowQ.isLoading : fallback.isLoading;
    const err = isLocal ? libRowQ.error : fallback.error;
    if (loading) {
      return (
        <div className="flex items-center justify-center py-16 text-faint">
          <Loader2 className="size-4 animate-spin" />
        </div>
      );
    }
    if (err) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="论文加载失败"
          description={
            (err as Error).message ||
            '该论文可能已下架或暂时不可用,请回到列表重新打开'
          }
        />
      );
    }
    return (
      <EmptyState
        icon={AlertCircle}
        title="页签已失效"
        description="请回到搜索结果或文献集列表,重新打开论文"
      />
    );
  }

  return (
    <PaperDetailView paper={paper} libRow={libRow} isLocal={isLocal} />
  );
}

// ============================================================================
// 视图层 —— 翻译切换 + 详情/PDF 切换 + 880 居中阅读栏
// ============================================================================

function PaperDetailView({
  paper,
  libRow,
  isLocal,
}: {
  paper: Paper;
  libRow: UserLibraryPaper | null;
  isLocal: boolean;
}) {
  // 翻译缓存 —— TranslatePaperButton 拿到结果后回灌,displayPaper 据此切原文/译文
  const [zh, setZh] = useState<TranslatePaperResult | null>(null);
  const [showZh, setShowZh] = useState(false);

  // 显示用 paper:翻成中文时把 title / abstract 替换,其他字段(authors / year / venue
  // 等)保持原样。子组件 Header / Abstract 透明感知。
  const displayPaper = useMemo<Paper>(() => {
    if (!showZh || !zh) return paper;
    return {
      ...paper,
      title: zh.title_zh || paper.title,
      abstract: zh.abstract_zh || paper.abstract,
    };
  }, [paper, showZh, zh]);

  // **不再内嵌 PDF 预览 tab** —— PDF 预览统一走 /browser/pdf/:libPaperId 独立 tab,
  // 由 PaperActionRow 的"查看 PDF"按钮触发 useOpenPdfInBrowser 打开。
  // 旧 ViewTabs(详情 / PDF 预览) + 内联 PdfViewer 已移除。

  return (
    <article className="h-full flex flex-col bg-background min-h-0">
      <div className="flex-1 min-h-0 overflow-auto">
        {/* 880 居中阅读栏 —— .pen `MVlP1` width 880;移动端收窄 padding 单列阅读 */}
        <div className="max-w-[880px] mx-auto px-4 pt-6 pb-16 sm:px-8 sm:pt-16 sm:pb-20">
          <PaperHeader
            paper={paper}
            displayedTitle={displayPaper.title || '无标题'}
            libRow={libRow}
            zh={zh}
            showZh={showZh}
            onTranslated={(r) => {
              setZh(r);
              setShowZh(true);
            }}
            onToggleZh={() => setShowZh((v) => !v)}
          />
          {/* abstract 跟着 displayPaper 走(可翻译);references / footer 用原 paper
              —— references 只依赖 paperId / source;footer 引用必须按原文格式 */}
          <PaperAbstract paper={displayPaper} />
          {!isLocal && <PaperReferences paper={paper} />}
          <PaperFooter paper={paper} />
        </div>
      </div>
    </article>
  );
}

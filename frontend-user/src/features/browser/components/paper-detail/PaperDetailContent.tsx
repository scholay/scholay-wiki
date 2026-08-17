import { useMemo, useState } from 'react';
import type { TranslatePaperResult } from '@/shared/api/translate';
import type { Paper, UserLibraryPaper } from '@/shared/api/types';
import { PaperHeader } from './PaperHeader';
import { PaperAbstract } from './PaperAbstract';
import { PaperReferences } from './PaperReferences';
import { PaperFooter } from './PaperFooter';

export interface PaperDetailContentProps {
  paper: Paper;
  libRow?: UserLibraryPaper | null;
  isLocal?: boolean;
  /** 侧栏等窄容器用更紧凑的内边距 */
  compact?: boolean;
}

/** 站内论文详情正文 —— /paper 浏览器页与搜索页右栏拓展模式共用。 */
export function PaperDetailContent({
  paper,
  libRow = null,
  isLocal = false,
  compact = false,
}: PaperDetailContentProps) {
  const [zh, setZh] = useState<TranslatePaperResult | null>(null);
  const [showZh, setShowZh] = useState(false);

  const displayPaper = useMemo<Paper>(() => {
    if (!showZh || !zh) return paper;
    return {
      ...paper,
      title: zh.title_zh || paper.title,
      abstract: zh.abstract_zh || paper.abstract,
    };
  }, [paper, showZh, zh]);

  return (
    <div
      className={
        compact
          ? 'mx-auto max-w-[880px] px-4 pb-12 pt-4 sm:px-6 sm:pt-6'
          : 'mx-auto max-w-[880px] px-4 pb-16 pt-6 sm:px-8 sm:pb-20 sm:pt-16'
      }
    >
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
      <PaperAbstract paper={displayPaper} />
      {!isLocal && <PaperReferences paper={paper} />}
      <PaperFooter paper={paper} />
    </div>
  );
}

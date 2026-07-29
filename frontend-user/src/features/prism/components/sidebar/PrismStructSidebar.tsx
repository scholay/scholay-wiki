import { ChevronLeft, ListTree, Image as ImageIcon } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarItem,
  SidebarSection,
} from '@/shared/components/sidebar';
import type { DocStruct, PrismConversation } from '../../api/prism';
import { PrismConversationList } from './PrismConversationList';

/**
 * 新版结构体工作台侧边栏 —— 通用 Sidebar 框架(同 PrismFileSidebar / ClawSidebar)。
 * struct 轨不暴露文件系统,侧栏改展示:返回项目列表 + 大纲(正文标题)+ 配图(已插入的图片资产)
 * + 会话历史(多对话切换,置底)。上=大纲、下=会话历史,一栏内滚动。
 */
export function PrismStructSidebar({
  doc,
  title,
  onBack,
  conversations,
  activeSessionId,
  onSwitchConversation,
}: {
  doc?: DocStruct;
  title: string;
  onBack: () => void;
  /** 多对话:本项目的对话列表(按最近活跃排序)。 */
  conversations: PrismConversation[];
  /** 当前活动对话 id(高亮用;null=跟随后端最近活跃)。 */
  activeSessionId: string | null;
  /** 切到某条对话。 */
  onSwitchConversation: (sessionId: string) => void;
}) {
  const outline = (doc?.body ?? [])
    .filter((b) => b.type === 'heading')
    .map((b, i) => ({ i, level: b.level ?? 1, text: b.text ?? '' }));
  const assets = Object.entries(doc?.assets ?? {}) as [string, { relPath?: string }][];

  return (
    <Sidebar>
      <SidebarContent>
        <button
          type="button"
          onClick={onBack}
          title="返回项目列表"
          className="group flex w-full items-center gap-1 px-3 pb-1 pt-3 text-left text-xs font-bold text-foreground"
        >
          <ChevronLeft className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-brand-red" />
          <span className="truncate group-hover:text-brand-red">{title || '未命名项目'}</span>
        </button>

        <SidebarSection id="prism-outline" label="大纲" prominent>
          {outline.length > 0 ? (
            outline.map((s) => (
              <SidebarItem
                key={s.i}
                label={s.text || '(无标题)'}
                icon={<ListTree />}
                indent={Math.min(Math.max(s.level - 1, 0), 3) as 0 | 1 | 2 | 3}
                size="sm"
              />
            ))
          ) : (
            <p className="px-4 py-1 text-2xs text-faint">正文暂无标题</p>
          )}
        </SidebarSection>

        {assets.length > 0 && (
          <SidebarSection id="prism-sources" label="配图" bordered>
            {assets.map(([id, a]) => (
              <SidebarItem key={id} label={a.relPath?.split('/').pop() ?? id} icon={<ImageIcon />} size="sm" />
            ))}
          </SidebarSection>
        )}

        {/* 会话历史(多对话,置底):上面是大纲/配图,这里切换本项目的多条对话(共享同一份论文)。 */}
        <PrismConversationList
          conversations={conversations}
          activeSessionId={activeSessionId}
          onSwitch={onSwitchConversation}
        />
      </SidebarContent>
    </Sidebar>
  );
}

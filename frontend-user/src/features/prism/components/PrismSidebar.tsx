import { useState } from 'react';
import {
  Circle,
  CircleDot,
  FileText,
  Pencil,
  Plus,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarSection,
  SidebarItem,
} from '@/shared/components/sidebar';

/**
 * Prism · AI 写作侧栏 — 对照 .pen `wzCqs`:
 *   项目元信息 + 目录(已完成/编辑中/待写)+ LaTeX 源文件树 + 编译状态 + user + 收起
 *
 * 简化版:目录 + 源文件两段,目录 active 用 danger 高亮"编辑中章节"。
 */
type TocItem = {
  id: string;
  label: string;
  done: boolean;
  editing?: boolean;
};

const TOC: TocItem[] = [
  { id: 'abstract', label: 'Abstract', done: true },
  { id: 'intro', label: '1  Introduction', done: true },
  { id: 'related', label: '2  Related Work', done: true },
  { id: 'method', label: '3  Method', done: false, editing: true },
  { id: 'exp', label: '4  Experiments', done: false },
  { id: 'discussion', label: '5  Discussion', done: false },
  { id: 'conclusion', label: '6  Conclusion', done: false },
  { id: 'references', label: 'References', done: false },
];

const FILES = [
  { id: 'main', label: 'main.tex', active: true },
  { id: 'intro', label: 'introduction.tex' },
  { id: 'method', label: 'method.tex' },
  { id: 'exp', label: 'experiments.tex' },
  { id: 'refs', label: 'references.bib' },
];

export function PrismSidebar() {
  const [activeToc, setActiveToc] = useState('method');
  const [activeFile, setActiveFile] = useState('main');

  return (
    <Sidebar>
      <SidebarContent>
        {/* 项目信息 */}
        <div className="flex items-start gap-2 px-4 pt-3 pb-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground truncate">
              DiT-3D Sampling
            </div>
            <div className="text-2xs text-faint mt-0.5">CVPR 2026 投稿</div>
          </div>
          <button
            type="button"
            aria-label="新建"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Plus className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        {/* 目录 */}
        <SidebarSection
          id="outline"
          label="目录"
          action={
            <span className="text-faint font-normal">
              {TOC.filter((i) => i.done).length} / {TOC.length}
            </span>
          }
        >
          {TOC.map((item) => {
            const isActive = activeToc === item.id;
            const iconNode = item.editing ? (
              <Pencil className="text-destructive" />
            ) : item.done ? (
              <CircleDot className="text-brand-green" />
            ) : (
              <Circle className="text-faintest" />
            );
            return (
              <SidebarItem
                key={item.id}
                icon={iconNode}
                label={item.label}
                size="sm"
                active={
                  isActive
                    ? item.editing
                      ? 'danger'
                      : 'primary'
                    : false
                }
                onClick={() => setActiveToc(item.id)}
              />
            );
          })}
        </SidebarSection>

        {/* LaTeX 源文件 */}
        <SidebarSection
          id="docs"
          label="LaTeX 源文件"
          bordered
          action={
            <button
              type="button"
              className="inline-flex items-center gap-0.5 text-foreground hover:opacity-70"
            >
              <Plus className="size-3" />
              新建
            </button>
          }
        >
          {FILES.map((file) => (
            <SidebarItem
              key={file.id}
              icon={<FileText />}
              label={file.label}
              size="sm"
              active={activeFile === file.id ? 'primary' : false}
              onClick={() => setActiveFile(file.id)}
            />
          ))}
        </SidebarSection>
      </SidebarContent>
    </Sidebar>
  );
}

import { Loader2, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { useQualityCheck, type QualityReceipt } from '../api/prism';

/**
 * 质量检查 —— 当前结构体的**确定性**双轨回执(悬空引用/未定义交叉引用/前置缺失/超长句)。
 * A 轨(硬问题)可一键「让 AI 修复」:把回执作为一条普通指令经既有对话发出(= 一个配额轮,天然披露)。
 * 这是把修订锚在**外部确定性信号**上、而非模型自评(避免 self-refine 偏差)。
 */
export function PrismQualityDialog({
  projectId,
  open,
  onOpenChange,
  onFix,
  disabled,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFix: (instruction: string) => void;
  disabled?: boolean;
}) {
  const q = useQualityCheck(open ? projectId : undefined);
  const r = q.data;

  // 作者/机构类前置缺失是「双重死端」:agent 改不了(不在其可编辑的 document.md 里),
  // 也没有内联编辑 UI —— 绝不喂给 AI 修(必然失败还烧一轮),另立提示(V3-4.3-3)。
  const isAuthorClass = (s: string) => s.includes('作者') || s.includes('机构');
  const aiFixableFront = (r?.missing_front ?? []).filter((s) => !isAuthorClass(s));
  const authorFront = (r?.missing_front ?? []).filter(isAuthorClass);

  const buildFixInstruction = (r: QualityReceipt): string => {
    const parts: string[] = ['请修复以下由系统确定性检查发现的问题(逐条处理,别引入新内容):'];
    if (r.dangling_cites.length)
      parts.push(
        `· 悬空文献引用(正文用了 [@键] 但 references.bib 里没有对应条目):${r.dangling_cites.map((k) => `[@${k}]`).join('、')}。` +
          `请用 minicod 查到真实论文补进 references.bib,或删除该引用——绝不要编造条目。`,
      );
    if (r.undefined_xrefs.length)
      parts.push(
        `· 未定义交叉引用(引了 [@键] 但没有对应打锚,编译会出 ??):${r.undefined_xrefs.map((k) => `[@${k}]`).join('、')}。` +
          `请给被引用的图/表/节补上 {#键} 锚,或修正引用键。`,
      );
    if (aiFixableFront.length) parts.push(`· 前置信息/投稿检查未通过:${aiFixableFront.join(';')}。请补齐。`);
    if (r.abstract_num_issues?.length)
      parts.push(
        `· 摘要数字对账不过:摘要里的 ${r.abstract_num_issues.join('、')} 在正文找不到出处。` +
          `请核对摘要与正文的数字使其一致(以正文为准修改摘要,绝不为了对齐去改正文数据)。`,
      );
    return parts.join('\n');
  };

  // 一致性(V4-⑥ = V2-A4 收尾):术语变体/风格混用 → 独立「让 AI 统一」一轮修复。
  const consistency = [...(r?.term_variants ?? []), ...(r?.style_issues ?? [])];
  const buildConsistencyInstruction = (): string =>
    '请做一轮全文一致性统一(只统一表述,不改论点/数据/引用):\n' +
    consistency.map((s) => `· ${s}`).join('\n') +
    '\n统一原则:同一概念全文用同一写法;以正文中出现次数更多的形式为准。';

  // AI 能修的硬问题:引用类 + 非作者类前置 + 摘要数字对账(作者类不算 AI 可修,避免空跑一轮)。
  const aiHardCount =
    (r?.dangling_cites.length ?? 0) +
    (r?.undefined_xrefs.length ?? 0) +
    aiFixableFront.length +
    (r?.abstract_num_issues?.length ?? 0);
  const hasHard = aiHardCount > 0;

  const Section = ({ title, keys, kind }: { title: string; keys: string[]; kind: 'cite' | 'xref' | 'plain' }) => {
    if (keys.length === 0) return null;
    return (
      <div>
        <p className="mb-1 text-2xs font-bold text-brand-red">
          {title}({keys.length})
        </p>
        <div className="flex flex-wrap gap-1">
          {keys.map((k) => (
            <span key={k} className="rounded-4 bg-danger-soft px-1.5 py-0.5 text-2xs text-brand-red">
              {kind === 'plain' ? k : `[@${k}]`}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>质量检查 · 确定性</DialogTitle>
        </DialogHeader>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-10 text-xs text-faint">
            <Loader2 className="mr-1.5 size-4 animate-spin" /> 检查中…
          </div>
        ) : !r ? (
          <p className="py-6 text-center text-xs text-faint">暂无法检查</p>
        ) : (
          <div className="space-y-3">
            {aiHardCount === 0 && authorFront.length === 0 ? (
              <div className="flex items-center gap-2 rounded-12 bg-brand-green/10 px-3 py-2 text-xs text-brand-green">
                <CheckCircle2 className="size-4 shrink-0" /> 未发现悬空引用 / 未定义交叉引用 / 前置缺失。
              </div>
            ) : hasHard ? (
              <>
                <div className="flex items-start gap-2 rounded-12 border border-brand-red/30 bg-danger-soft p-2.5 text-xs text-brand-red">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>发现 {aiHardCount} 处 AI 可修的确定性问题(引用/交叉引用/前置)。一键交给 AI 修复(消耗一个额度轮)。</span>
                </div>
                <Section title="悬空文献引用" keys={r.dangling_cites} kind="cite" />
                <Section title="未定义交叉引用" keys={r.undefined_xrefs} kind="xref" />
                <Section title="前置/投稿检查" keys={aiFixableFront} kind="plain" />
                <Section title="摘要数字无正文出处" keys={r.abstract_num_issues ?? []} kind="plain" />
              </>
            ) : null}
            {/* 一致性(V4-⑥):术语变体/风格混用 —— 独立一轮「统一」修复 */}
            {consistency.length > 0 && (
              <div className="space-y-1 rounded-12 border border-border px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-2xs font-bold text-subtle">全文一致性({consistency.length})</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-2xs"
                    disabled={disabled}
                    onClick={() => {
                      onFix(buildConsistencyInstruction());
                      onOpenChange(false);
                    }}
                  >
                    让 AI 统一
                  </Button>
                </div>
                {consistency.map((s, i) => (
                  <p key={i} className="text-2xs text-muted-foreground">
                    · {s}
                  </p>
                ))}
              </div>
            )}
            {/* 作者/机构类:另立提示,AI 与当前 UI 都改不了(双重死端),不给「让 AI 修复」按钮 */}
            {authorFront.length > 0 && (
              <div className="rounded-12 border border-border bg-surface-1 px-3 py-2 text-2xs text-muted-foreground">
                <p className="font-bold text-subtle">作者 / 机构信息</p>
                <p className="mt-0.5">{authorFront.join(';')}。</p>
                <p className="mt-0.5 text-faint">在顶栏「作者/机构」里填写,AI 不代填(避免编造真实人名/单位)。</p>
              </div>
            )}
            {/* 生成侧信号(V2-A4):写作进度账,不计入硬问题数 */}
            {(r.stub_sections?.length > 0 || r.todo_count > 0 || (r.abbrev_issues?.length ?? 0) > 0) && (
              <div className="space-y-1 rounded-12 bg-surface-1 px-3 py-2">
                <p className="text-2xs font-bold text-faint">写作进度(不计入问题数)</p>
                {r.stub_sections?.length > 0 && (
                  <p className="text-2xs text-muted-foreground">
                    待起草的骨架节({r.stub_sections.length}):{r.stub_sections.join('、')}
                  </p>
                )}
                {r.todo_count > 0 && (
                  <p className="text-2xs text-muted-foreground">正文还有 {r.todo_count} 处 TODO 占位待回填。</p>
                )}
                {r.abbrev_issues?.length > 0 && (
                  <p className="text-2xs text-muted-foreground">缩写一致性:{r.abbrev_issues.join(';')}</p>
                )}
              </div>
            )}
            {r.long_sentences > 0 && (
              <p className="text-2xs text-muted-foreground">
                另有 {r.long_sentences} 处超长句(软提示,可加载 <code>wl-clarity</code> 让 AI 拆句;不计入上面的问题数)。
              </p>
            )}
            {hasHard && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    onFix(buildFixInstruction(r));
                    onOpenChange(false);
                  }}
                >
                  <Sparkles className="size-3.5" /> 让 AI 修复
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
PrismQualityDialog.displayName = 'PrismQualityDialog';

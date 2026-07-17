import { Sparkles } from 'lucide-react';

/**
 * 会话内「本轮加载了某技能」的 chip 头部徽标 —— 挂在 ToolCallBlock 的 renderHeaderExtras。
 *
 * 两类来源:
 *   - kind='user'  : 用户自己安装/启用的**市场技能** → brand-green +「你的」标识,一眼可辨是自装能力
 *   - kind='system': 平台**预置能力** → 中性灰,只做统一能力署名,不贴"官方"标签
 *
 * 设计取舍(对齐 ChatGPT / Claude / Cursor 等):信任决策(官方/社区分区、风险提示)放在
 * 安装/启用面(市场卡 + 启用面板),会话流里只做「能力署名 + 你的标识」,避免每条消息重复贴标签。
 *
 * 纯展示组件,不感知具体 feature;label 由调用方(claw MessageTurn)按 guideName 解析后传入。
 */
export function SkillHeaderBadge({
  label,
  kind,
}: {
  /** 展示名:用户技能用其显示名,系统能力用人类可读名。 */
  label: string;
  kind: 'user' | 'system';
}) {
  if (kind === 'user') {
    return (
      <span className="inline-flex min-w-0 shrink items-center gap-1 rounded-pill bg-brand-green/10 px-1.5 py-0.5 text-2xs font-semibold text-brand-green">
        <Sparkles className="size-2.5 shrink-0" strokeWidth={2.4} />
        <span className="truncate">你的 · {label}</span>
      </span>
    );
  }
  return (
    <span className="min-w-0 shrink truncate text-2xs text-muted-foreground">
      {label}
    </span>
  );
}

/** 从 Skill 工具入参提取加载 key(input.name = u<uid>-<slug> 或一方 slug)。 */
export function extractSkillGuideName(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const name = (input as Record<string, unknown>).name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return undefined;
}

import {
  ArrowLeft,
  Copy,
  Download,
  Files,
  Flag,
  Package,
  Rocket,
  Share2,
  ShieldAlert,
  Terminal,
  User,
} from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const DECLARED_TOOLS = ["web_search", "file_read", "citation_export"];
const FILES_INCLUDED = [
  "SKILL.md",
  "references/protocol.md",
  "templates/evidence-table.md",
];

/** 社区 Skill 详情页的已审核、可安装状态 · 来源：SkillDetailPage。 */
export function WikiEmbedCommunitySkill() {
  return (
    <div
      className="w-full max-w-3xl bg-background px-4 py-6"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="community-skill"
    >
      <div className="mb-4 inline-flex items-center gap-1 text-12 text-muted-foreground">
        <ArrowLeft className="size-3" />
        返回市场
      </div>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-24 font-medium text-foreground">系统综述助手</h1>
          <span className="inline-flex items-center gap-1 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-2 py-1 text-12 font-medium text-brand-amber">
            <ShieldAlert className="size-3" />
            社区 Skill · 使用前请审阅内容
          </span>
        </div>
        <p className="mt-1 text-16 text-muted-foreground">
          把研究问题拆成检索、筛选、质量评价与证据整理步骤。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-12 text-faint">
          <span className="inline-flex items-center gap-1">
            <User className="size-3" />
            Lin Research Lab
          </span>
          <span className="inline-flex items-center gap-1">
            <Download className="size-3" />
            1,248 次安装
          </span>
          <span>v1.4.0</span>
          <span className="inline-flex items-center gap-1">
            <Files className="size-3" />3 个文件
          </span>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-1 rounded-8 bg-brand-green px-3 text-16 font-medium text-on-brand">
          <Rocket className="size-3" />
          去使用
        </span>
        <span className="inline-flex h-8 items-center rounded-8 border border-border bg-background px-3 text-16 font-medium text-foreground">
          加入我的（智能助手用）
        </span>
        <span className="inline-flex h-8 items-center gap-1 rounded-8 px-3 text-16 text-subtle">
          <Share2 className="size-3" />
          分享
        </span>
        <span className="inline-flex h-8 items-center gap-1 rounded-8 px-3 text-16 text-subtle">
          <Flag className="size-3" />
          举报
        </span>
      </div>

      <section className="mb-4 rounded-12 border border-border bg-background p-4">
        <h2 className="mb-3 flex items-center gap-2 text-20 font-medium text-foreground">
          <Package className="size-4 text-brand-green" />
          去使用 —— 装进你的智能体
        </h2>

        <div className="mb-1 flex items-center gap-1 text-16 font-medium text-foreground">
          <Terminal className="size-3 text-faint" />
          Claude Code / Claude 家族（推荐）
        </div>
        <div className="flex items-stretch gap-2">
          <code className="min-w-0 flex-1 overflow-hidden rounded-8 border border-border bg-surface-1 px-3 py-2 font-mono text-12 leading-code text-subtle">
            curl -fsSL https://scholay.com/skills/systematic-review/install.sh |
            sh
          </code>
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 border border-border bg-background text-subtle">
            <Copy className="size-4" />
          </span>
        </div>
        <p className="mt-1 text-12 text-faint">
          粘贴到终端运行；Claude Code 会自动发现，重开一个会话即可使用
        </p>

        <div className="mt-3">
          <p className="mb-2 text-16 text-muted-foreground">
            其他智能体 —— 下载后放进 skills 目录
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1 rounded-8 border border-border bg-background px-3 text-16 font-medium text-foreground">
              <Download className="size-4" />
              下载 .tar.gz
            </span>
            <span className="inline-flex h-8 items-center gap-1 rounded-8 border border-border bg-background px-3 text-16 text-subtle">
              <Copy className="size-3" />
              复制下载链接
            </span>
            <span className="text-12 text-brand-green">
              安装说明 install.md →
            </span>
          </div>
        </div>
      </section>

      <section className="mb-4">
        <p className="mb-2 text-12 text-faint">
          该 Skill 声明会用到（仅供参考，平台按最小权限实际收窄）：
        </p>
        <div className="flex flex-wrap gap-1">
          {DECLARED_TOOLS.map((tool) => (
            <span
              key={tool}
              className="rounded-4 border border-border bg-background px-2 py-1 font-mono text-12 text-subtle"
            >
              {tool}
            </span>
          ))}
        </div>
      </section>

      <section className="mb-4">
        <p className="mb-2 text-12 text-faint">包含文件：</p>
        <div className="flex flex-wrap gap-1">
          {FILES_INCLUDED.map((file) => (
            <span
              key={file}
              className="rounded-4 border border-border bg-surface-1 px-2 py-1 font-mono text-12 text-subtle"
            >
              {file}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-12 border border-border bg-surface-1 p-4">
        <p className="mb-3 text-12 uppercase text-faint">SKILL.md 预览</p>
        <div className="space-y-3 text-16 leading-paragraph text-subtle">
          <h2 className="text-20 font-medium text-foreground">系统综述助手</h2>
          <p>
            用于形成可复核的系统综述工作流。开始前先记录研究问题、纳入标准、数据库与检索日期。
          </p>
          <h3 className="font-medium text-foreground">工作流程</h3>
          <ol className="list-decimal space-y-1 pl-6">
            <li>按 PICO 或 SPIDER 框架明确研究问题。</li>
            <li>为每个数据库生成并保存检索式。</li>
            <li>记录去重、初筛、全文筛选与排除理由。</li>
            <li>输出证据表，并将结论与原文引文逐条绑定。</li>
          </ol>
          <p className="rounded-8 border border-border bg-background px-3 py-2 font-mono text-12 leading-code">
            输出：protocol.md · screening-log.csv · evidence-table.md
          </p>
        </div>
      </section>
    </div>
  );
}

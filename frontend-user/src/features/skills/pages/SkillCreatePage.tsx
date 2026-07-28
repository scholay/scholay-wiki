import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  UploadCloud,
  FolderOpen,
  FileArchive,
  MessagesSquare,
  Check,
  FileText,
} from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { Button, Input, Textarea } from '@/shared/ui';
import { useCreateSkill } from '@/shared/api/skills';

type UploadMode = 'file' | 'chat';
type Source = 'original' | 'reposted';

const SKILL_TEMPLATE = `---
name: 我的技能
description: 一句话说明这个技能做什么
menu: 何时该用它(≤60字,会显示在技能菜单里)
---

# 技能标题

遇到什么任务时用它、按什么步骤 / 方法做、有哪些门道和注意事项。
`;

/**
 * 新建 Skill 向导(/skills/new)。两步:1 上传源码 → 2 填写信息。
 * 支持文件夹 / zip 多文件(SKILL.md + 脚本/资源),或纯文本 SKILL.md 快速创建。
 * 附带代码不在本平台运行,仅供外部 agent 下载使用(见《安全规范》)。
 */
export function SkillCreatePage() {
  const navigate = useNavigate();
  const create = useCreateSkill();
  const [step, setStep] = useState<1 | 2>(1);

  // 步骤1
  const [mode, setMode] = useState<UploadMode>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [zip, setZip] = useState<File | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [content, setContent] = useState(SKILL_TEMPLATE);
  const [source, setSource] = useState<Source>('original');
  const [agreed, setAgreed] = useState(false);

  // 步骤2
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [category, setCategory] = useState('');

  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const hasSource = zip != null || files.length > 0 || (textMode && content.trim().length > 0);
  const canNext = agreed && hasSource;

  const pickFolder = (fl: FileList | null) => {
    if (!fl) return;
    const arr = Array.from(fl).filter((f) => f.size > 0);
    setFiles(arr);
    setZip(null);
    setTextMode(false);
  };
  const pickZip = (fl: FileList | null) => {
    const f = fl?.[0];
    if (!f) return;
    setZip(f);
    setFiles([]);
    setTextMode(false);
  };

  const submit = () => {
    if (!name.trim()) {
      toast.error('请填写 Skill 名称');
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        tagline: tagline.trim(),
        category: category.trim() || undefined,
        contentSource: source,
        zip: zip ?? undefined,
        files: files.length > 0 ? files : undefined,
        content: textMode ? content : undefined,
      },
      {
        onSuccess: (r) => {
          toast.success('已创建');
          navigate(`/skills/${r.slug || r.id}`);
        },
        onError: (e) => toast.error((e as Error).message || '创建失败'),
      }
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <RouteSEO title="发布 Skill" description="上传并发布你的智能体技能" />

      {/* 顶部:返回 + 步骤指示 */}
      <div className="mb-6 flex items-center gap-6">
        <Link
          to="/skills/mine"
          className="flex items-center gap-1 text-12 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Link>
        <div className="flex items-center gap-3 text-12">
          <StepDot n={1} active={step === 1} done={step > 1} label="上传源码" />
          <div className="h-px w-16 bg-border" />
          <StepDot n={2} active={step === 2} done={false} label="填写信息" />
        </div>
      </div>

      <div className="rounded-16 border border-border bg-surface-card p-6">
        {step === 1 ? (
          <>
            <h2 className="text-14 font-medium text-foreground">选择上传方式</h2>
            <p className="mt-1 text-12 text-muted-foreground">
              选择以下任意一种方式上传你的 Skill 源码
            </p>

            {/* 上传方式切换 */}
            <div className="mt-4 flex gap-2">
              <ModeButton
                active={mode === 'file'}
                icon={FolderOpen}
                label="上传文件"
                onClick={() => setMode('file')}
              />
              <ModeButton
                active={mode === 'chat'}
                icon={MessagesSquare}
                label="通过对话上传"
                disabled
                onClick={() => {}}
              />
            </div>

            {mode === 'file' && (
              <div className="mt-4">
                {/* 拖拽/选择区 */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dropped = Array.from(e.dataTransfer.files);
                    const single = dropped[0];
                    if (dropped.length === 1 && single.name.toLowerCase().endsWith('.zip')) {
                      setZip(single);
                      setFiles([]);
                    } else if (dropped.length > 0) {
                      setFiles(dropped);
                      setZip(null);
                    }
                    setTextMode(false);
                  }}
                  className="flex flex-col items-center gap-3 rounded-12 border border-dashed border-border-strong bg-surface-1 px-4 py-10 text-center"
                >
                  <UploadCloud className="h-8 w-8 text-faint" />
                  <p className="text-12 text-muted-foreground">
                    拖拽 <span className="font-medium text-foreground">zip 文件</span> 到此处,或用下方按钮选择文件夹 / zip
                  </p>
                  <p className="text-12 text-faint">
                    支持 .md/.txt/.py/.js/.css/.json/.xml 等;单文件 ≤10MB,总 ≤30MB
                  </p>
                  <div className="mt-1 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => folderRef.current?.click()}>
                      <FolderOpen className="mr-1 h-4 w-4" />
                      选择文件夹
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => zipRef.current?.click()}>
                      <FileArchive className="mr-1 h-4 w-4" />
                      选择 zip 文件
                    </Button>
                  </div>
                  <input
                    ref={(el) => {
                      folderRef.current = el;
                      if (el) el.setAttribute('webkitdirectory', '');
                    }}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => pickFolder(e.target.files)}
                  />
                  <input
                    ref={zipRef}
                    type="file"
                    accept=".zip"
                    hidden
                    onChange={(e) => pickZip(e.target.files)}
                  />
                </div>

                {/* 已选内容 / 纯文本切换 */}
                <div className="mt-2 flex items-center justify-between text-12">
                  <SelectedSummary zip={zip} files={files} />
                  <button
                    className="text-brand-green hover:underline"
                    onClick={() => {
                      setTextMode((v) => !v);
                      setFiles([]);
                      setZip(null);
                    }}
                  >
                    {textMode ? '改为上传文件夹/zip' : '或直接粘贴 SKILL.md 文本'}
                  </button>
                </div>

                {textMode && (
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                    className="mt-2 h-56 resize-none bg-surface-1 p-3 font-mono leading-paragraph"
                  />
                )}
              </div>
            )}

            {mode === 'chat' && (
              <div className="mt-4 rounded-12 border border-dashed border-border bg-surface-1 px-4 py-10 text-center text-12 text-muted-foreground">
                「通过对话上传」即将上线:届时可让智能助手帮你把想法生成为 Skill。
              </div>
            )}

            {/* 内容来源 */}
            <div className="mt-6">
              <div className="mb-2 text-12 font-medium text-foreground">选择内容来源</div>
              <div className="grid grid-cols-2 gap-3">
                <SourceOption
                  active={source === 'original'}
                  label="Skill 源码为原创"
                  onClick={() => setSource('original')}
                />
                <SourceOption
                  active={source === 'reposted'}
                  label="Skill 源码来自转载"
                  onClick={() => setSource('reposted')}
                />
              </div>
            </div>

            {/* 安全规范 */}
            <label className="mt-5 flex items-center justify-center gap-2 text-12 text-muted-foreground">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              我已阅读并同意
              <Link to="/help/skill-safety" className="text-brand-green hover:underline">
                《Skill 发布安全规范》
              </Link>
            </label>

            <div className="mt-5 flex justify-center">
              <Button
                variant="primary"
                disabled={!canNext}
                onClick={() => setStep(2)}
                className="px-10"
              >
                下一步
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-14 font-medium text-foreground">填写信息</h2>
            <p className="mt-1 text-12 text-muted-foreground">
              这些信息会展示在市场卡片与详情页。SKILL.md 内的元数据由平台自动提取。
            </p>
            <div className="mt-4 space-y-3">
              <Field label="名称">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="例:系统性文献综述法"
                  className="h-9"
                />
              </Field>
              <Field label="一句话简介">
                <Input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={255}
                  placeholder="简述这个技能能帮什么忙"
                  className="h-9"
                />
              </Field>
              <Field label="分类(可选)">
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  maxLength={40}
                  placeholder="如 research / writing / analysis"
                  className="h-9"
                />
              </Field>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                上一步
              </Button>
              <Button variant="primary" disabled={create.isPending} onClick={submit} className="px-10">
                {create.isPending ? '发布中…' : '发布'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepDot({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={
          'flex h-5 w-5 items-center justify-center rounded-pill text-12 ' +
          (active || done ? 'bg-foreground text-on-dark' : 'bg-surface-2 text-faint')
        }
      >
        {done ? <Check className="h-3 w-3" /> : n}
      </span>
      <span className={active ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </span>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  active: boolean;
  icon: typeof FolderOpen;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        'flex items-center gap-1.5 rounded-8 border px-3 py-1.5 text-12 ' +
        (active
          ? 'border-border-strong bg-surface-2 text-foreground'
          : 'border-border bg-surface-card text-muted-foreground hover:bg-surface-1') +
        (disabled ? ' cursor-not-allowed opacity-50' : '')
      }
    >
      <Icon className="h-4 w-4" />
      {label}
      {disabled && <span className="text-12 text-faint">即将上线</span>}
    </button>
  );
}

function SourceOption({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center gap-2 rounded-8 border px-4 py-3 text-12 ' +
        (active ? 'border-brand-green bg-brand-green/5 text-foreground' : 'border-border text-muted-foreground hover:bg-surface-1')
      }
    >
      <span
        className={
          'flex h-4 w-4 items-center justify-center rounded-pill border ' +
          (active ? 'border-brand-green' : 'border-border-button')
        }
      >
        {active && <span className="h-2 w-2 rounded-pill bg-brand-green" />}
      </span>
      {label}
    </button>
  );
}

function SelectedSummary({ zip, files }: { zip: File | null; files: File[] }) {
  if (zip) {
    return (
      <span className="flex items-center gap-1 text-foreground">
        <FileArchive className="h-3.5 w-3.5" />
        {zip.name}
      </span>
    );
  }
  if (files.length > 0) {
    return (
      <span className="flex items-center gap-1 text-foreground">
        <FileText className="h-3.5 w-3.5" />
        已选 {files.length} 个文件
      </span>
    );
  }
  return <span className="text-faint">未选择</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-12 text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

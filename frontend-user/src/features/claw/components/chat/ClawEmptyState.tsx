import { Sparkles } from 'lucide-react';

/** 新对话空白态 —— 桌面 ClawPage 与移动 MobileClawPage 共用。 */
export function ClawEmptyState() {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-foreground/5">
          <Sparkles className="h-6 w-6 text-foreground" />
        </div>
        <h2 className="mt-4 font-serif text-xl font-bold text-foreground">智能助手 · Claw</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          你的科研搭档 —— 找文献、读论文、查期刊、改摘要,
          也可以上传 PDF / 图片让我帮你分析。
        </p>
        <ul className="mt-5 flex flex-col gap-2 text-left text-sm text-muted-foreground">
          <li>· 找一篇关于「Transformer 在医学影像中的应用」的综述</li>
          <li>· 上传一份 PDF, 让我帮你写一段中文摘要</li>
          <li>· 这张图里的实验装置缺少什么对照?</li>
          <li>· Nature Methods 最近半年发了什么 AI 相关的文章?</li>
        </ul>
      </div>
    </div>
  );
}

import { Construction } from 'lucide-react';

/**
 * Zotero / EndNote 导入 tab 的占位 —— 后端 / 集成尚未实现,展示"即将推出"友好提示。
 */
export function ComingSoonTab({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-warning-soft">
        <Construction className="size-5 text-brand-amber" strokeWidth={2} />
      </div>
      <div className="text-base font-semibold text-foreground">
        {name} 导入即将推出
      </div>
      <div className="max-w-[420px] text-sm text-muted-foreground">
        我们正在打磨与 {name} 的对接,届时可一键把你的文献库 + 注释 + 标签
        同步过来。现阶段先用「本地上传」或「在线搜索加入」。
      </div>
    </div>
  );
}

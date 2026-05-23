import { useMutation } from '@tanstack/react-query';
import { streamSsePost } from '@/shared/lib/sse-post';

/**
 * 论文翻译 —— 调后端 SSE 流式接口 `POST /public/translate/paper/stream`,
 * 后端把 OpenAI chat completion 流转发出来,每个 SSE event 是:
 *   data: {"choices":[{"delta":{"content":"…"}}]}\n\n
 * 结束标记:
 *   data: [DONE]\n\n
 *
 * Prompt 约束模型输出固定 XML(见 backend prompts/paper_translation.go):
 *   <title_zh>...</title_zh>
 *   <abstract_zh>...</abstract_zh>
 *   <tldr_zh>...</tldr_zh>
 *
 * 简化策略:流式累积,完成后一次性 parse 出 title/abstract/tldr 三段。
 */

export interface TranslatePaperRequest {
  title?: string;
  abstract?: string;
  tldr?: string;
}

export interface TranslatePaperResult {
  title_zh: string;
  abstract_zh: string;
  tldr_zh: string;
}

/**
 * 跑一次完整翻译。fetch + SSE 解析下沉到 `shared/lib/sse-post`,
 * 这里只关心翻译特有的协议(累积 delta.content,[DONE] 收尾)。
 */
async function translatePaperStream(
  req: TranslatePaperRequest,
  signal?: AbortSignal
): Promise<TranslatePaperResult> {
  let content = '';

  await streamSsePost({
    url: '/public/translate/paper/stream',
    body: req,
    signal,
    onEvent: ({ data }) => {
      if (data === '[DONE]' || data === '') return;
      try {
        const j = JSON.parse(data);
        // 标准 OpenAI chunk 形态;后端透传
        const delta = j?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') content += delta;
        // 后端封装的错误事件 —— 抛出后由 mutation onError 接收
        if (j?.error) throw new Error(String(j.error));
      } catch (e) {
        // 重新抛业务错误,JSON 解析失败静默(对应 [DONE] 等非 JSON 行)
        if (e instanceof Error && e.message && !e.message.startsWith('Unexpected token')) {
          throw e;
        }
      }
    },
  });

  return parseTranslationXml(content);
}

function parseTranslationXml(raw: string): TranslatePaperResult {
  return {
    title_zh: extractTag(raw, 'title_zh'),
    abstract_zh: extractTag(raw, 'abstract_zh'),
    tldr_zh: extractTag(raw, 'tldr_zh'),
  };
}

function extractTag(s: string, tag: string): string {
  const m = s.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return (m?.[1] ?? '').trim();
}

/**
 * 翻译论文 mutation —— 同一篇论文同一时间只跑一次(由组件内 state 控制按钮)。
 *
 *   const mut = useTranslatePaper();
 *   mut.mutate({ title, abstract }, { onSuccess: (zh) => setZh(zh) });
 */
export function useTranslatePaper() {
  return useMutation({
    mutationFn: (req: TranslatePaperRequest) => translatePaperStream(req),
  });
}

/**
 * 简易语言判断 —— 出现 4 个及以上拉丁字母即认为有翻译需求。
 * 不做严格 unicode 区段分析(够日常用),避免误判纯数字标题或纯中文摘要。
 */
export function needsTranslation(s?: string): boolean {
  if (!s) return false;
  const letters = (s.match(/[A-Za-z]/g) ?? []).length;
  return letters >= 4;
}

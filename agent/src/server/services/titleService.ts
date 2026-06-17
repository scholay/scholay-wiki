/**
 * Title Service — AI-powered session title generation
 *
 * Two-stage approach matching the CLI:
 * 1. deriveTitle() — instant placeholder from first user message
 * 2. generateTitle() — async Haiku call for a polished 3-7 word title
 */

import { ProviderService, buildAnthropicAuthHeaders, getPresetAuthStrategy } from './providerService.js'
import { sessionService } from './sessionService.js'
import { stripAgentBridgeRulesPreamble } from './agentBridgePreamble.js'

export { stripAgentBridgeRulesPreamble }

const TITLE_MAX_LEN = 50

const TITLE_SYSTEM_PROMPT = `Generate a concise, sentence-case title (3-7 words) that captures the main topic or goal of this coding session. The title should be clear enough that the user recognizes the session in a list. Use sentence case: capitalize only the first word and proper nouns.

Return JSON with a single "title" field.

Good examples:
{"title": "Fix login button on mobile"}
{"title": "Add OAuth authentication"}
{"title": "Debug failing CI tests"}
{"title": "Refactor API client error handling"}

Bad (too vague): {"title": "Code changes"}
Bad (too long): {"title": "Investigate and fix the issue where the login button does not respond on mobile devices"}
Bad (wrong case): {"title": "Fix Login Button On Mobile"}

IMPORTANT: Output ONLY the JSON title. Do NOT answer, analyze, or respond to the conversation content — your only job is to name it. Match the conversation's language (Chinese in → Chinese title).`

/**
 * Quick placeholder title derived from user message text.
 * Returns first sentence, collapsed to single line, max 50 chars.
 */
export function deriveTitle(raw: string): string | undefined {
  const clean = stripAgentBridgeRulesPreamble(raw)
    .replace(/<[^>]+>[^<]*<\/[^>]+>/g, '')
    .trim()
  const firstSentence = /^(.*?[.!?。！？])\s/.exec(clean)?.[1] ?? clean
  const flat = firstSentence.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  return flat.length > TITLE_MAX_LEN
    ? flat.slice(0, TITLE_MAX_LEN - 1) + '\u2026'
    : flat
}

/**
 * Generate an AI title using the session's provider Haiku model when possible.
 * Fire-and-forget — returns null on any failure.
 */
/** 标题生成的 token 用量(带外:这次直连模型不产生 message_complete 帧,后端 WS 看不到)。 */
export interface TitleGenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
}

export async function generateTitle(
  conversationText: string,
  providerId?: string | null,
  // 成功时回调本次标题调用的 model + token 用量;调用方据此带内回后端账本(发 token_usage WS 帧)。
  // 可选 —— 不传则纯生成标题(单测/旧调用不受影响)。
  onUsage?: (info: { model: string; usage: TitleGenUsage }) => void,
): Promise<string | null> {
  const trimmed = stripAgentBridgeRulesPreamble(conversationText).trim()
  if (!trimmed) return null

  try {
    const providerService = new ProviderService()
    if (providerId === null) return null

    let resolvedProvider = providerId
      ? await providerService.getProvider(providerId)
      : null

    if (!resolvedProvider) {
      const { activeId, providers } = await providerService.listProviders()
      resolvedProvider = activeId
        ? providers.find((provider) => provider.id === activeId) ?? null
        : null
    }

    if (!resolvedProvider?.baseUrl || !resolvedProvider?.apiKey) return null

    const model = resolvedProvider.models.haiku || resolvedProvider.models.main
    const url = `${resolvedProvider.baseUrl.replace(/\/+$/, '')}/v1/messages`

    // 鉴权头按 provider 的 authStrategy 计算(不能写死 x-api-key)—— 生产中转大多是
    // auth_token(Bearer)体系,写死 x-api-key 会让标题生成 401 静默失败、退化成首句。
    // 复用 providerService 与 CLI 正文同一套 header 逻辑,杜绝漂移。
    const authStrategy = resolvedProvider.authStrategy ?? getPresetAuthStrategy(resolvedProvider.presetId)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...buildAnthropicAuthHeaders(resolvedProvider.apiKey, authStrategy),
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system: TITLE_SYSTEM_PROMPT,
        // 指令也放进 user 消息 + 把对话内容用 """ 包起来明确「这是待起名的内容,不是要回答的问题」。
        // 仅靠 system 提示词时,指令跟随较弱的中转模型(如 deepseek-flash)会直接「回答」对话内容
        // 而非生成标题 → 输出超长被 parseGeneratedTitleText 判为非标题 → null → 退化首句。
        messages: [
          {
            role: 'user',
            content: `Conversation to title:\n"""${trimmed.slice(0, 2000)}"""\n\nReturn only {"title":"..."} — do not answer or analyze the content.`,
          },
        ],
        // 标题是简单摘要,强制关闭 thinking:① 本就不需要推理;② 防止带 thinking 的上游
        // (deepseek 等默认开 thinking)把 max_tokens 预算耗在 thinking 块上 → text 块为空
        // → 返回 null → 退化成首句(这正是标题生不出来的第二个根因,鉴权之外)。
        // {type:'disabled'} 对 Anthropic / deepseek-anthropic 均合法(已实测 200 + 干净标题)。
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      // 不再静默:标题没生成几乎都卡在这里(鉴权/模型/上游),打点便于排查。
      const detail = await response.text().catch(() => '')
      console.warn(
        `[titleService] generateTitle failed: ${response.status} ${response.statusText} ` +
          `(provider=${resolvedProvider.presetId}, strategy=${authStrategy}) ${detail.slice(0, 200)}`,
      )
      return null
    }

    const body = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
    }
    const text = body.content?.find((b) => b.type === 'text')?.text
    if (!text) return null

    // 把本次标题生成的 token 用量回报给调用方(成功且拿到 usage 时)。字段名从 Anthropic 的
    // cache_*_input_tokens 归一到后端账本用的 cache_*_tokens。失败/无 usage 静默跳过。
    if (onUsage && body.usage) {
      onUsage({
        model,
        usage: {
          input_tokens: body.usage.input_tokens ?? 0,
          output_tokens: body.usage.output_tokens ?? 0,
          cache_read_tokens: body.usage.cache_read_input_tokens ?? 0,
          cache_creation_tokens: body.usage.cache_creation_input_tokens ?? 0,
        },
      })
    }

    return parseGeneratedTitleText(text)
  } catch (err) {
    console.warn(`[titleService] generateTitle error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

export function parseGeneratedTitleText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const parsed = parseTitleFromStructuredText(trimmed)
  if (parsed) return normalizeTitle(parsed)

  if (looksLikeStructuredTitleFragment(trimmed)) return null

  return normalizeTitle(trimmed)
}

function parseTitleFromStructuredText(text: string): string | null {
  const candidates = new Set<string>([text])
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim()
  if (fenced) candidates.add(fenced)

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(text.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of [...candidates]) {
    const unescaped = candidate.replace(/\\"/g, '"').replace(/\\n/g, '\n')
    if (unescaped !== candidate) candidates.add(unescaped)
  }

  for (const candidate of candidates) {
    const title = parseTitleJson(candidate)
    if (title) return title
  }

  return null
}

function parseTitleJson(candidate: string): string | null {
  try {
    const parsed = JSON.parse(candidate)
    if (typeof parsed === 'string') {
      return parseTitleFromStructuredText(parsed)
    }
    if (parsed && typeof parsed === 'object' && typeof (parsed as { title?: unknown }).title === 'string') {
      return (parsed as { title: string }).title
    }
  } catch {
    return null
  }
  return null
}

function normalizeTitle(title: string): string | null {
  const clean = title.replace(/\s+/g, ' ').trim()
  if (!clean || clean.length > 60 || looksLikeStructuredTitleFragment(clean)) return null
  return clean
}

function looksLikeStructuredTitleFragment(text: string): boolean {
  return (
    text.includes('```') ||
    text.includes('{') ||
    text.includes('}') ||
    /\\?"title\\?"\s*:/.test(text)
  )
}


/**
 * Persist an AI-generated title to the session's JSONL file.
 * Returns false when a user custom title exists, because custom titles are
 * intentional and must not be replaced by automatic title refreshes.
 */
export async function saveAiTitle(sessionId: string, title: string): Promise<boolean> {
  if (await sessionService.getCustomTitle(sessionId)) {
    return false
  }
  await sessionService.appendAiTitle(sessionId, title)
  return true
}

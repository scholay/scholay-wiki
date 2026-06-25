/**
 * Memory Service — 「per-user 长期记忆抽取」的廉价模型执行器(backend 编排,agent 执行)。
 *
 * backend 经 WS extract_memory 帧把**组装好的** system/user prompt(含当前记忆 + 最近对话 + 抽取规则)
 * 推过来,这里用会话 provider 的便宜模型(haiku || main)跑一次补全,把**原始输出文本**经 memory_update
 * 帧回传给 backend。解析 / StandardBlocks 白名单 / 截断 / 写库全在 backend(单一真源,零 TS 漂移);
 * agent 只当无状态执行器。与 titleService.generateTitle 共用同一套 provider 解析 / 鉴权 / thinking 关闭手法。
 */

import { ProviderService, buildAnthropicAuthHeaders, getPresetAuthStrategy } from './providerService.js'

/** 一次廉价补全的 token 用量(带外:不产生 message_complete 帧,由调用方带内回 backend 账本)。 */
export interface CheapCallUsage {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
}

/**
 * runCheapCall 用会话便宜模型跑一次 system+user 补全,返回**原始文本**(失败/空 → null)。
 * 不做任何解析(backend 负责)。onUsage 在成功且拿到 usage 时回调一次。
 */
export async function runCheapCall(
  system: string,
  user: string,
  providerId?: string | null,
  onUsage?: (info: { model: string; usage: CheapCallUsage }) => void,
): Promise<string | null> {
  if (!system.trim() || !user.trim()) return null

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

    // 鉴权头按 provider 的 authStrategy 计算(同 titleService,不能写死 x-api-key,生产中转多走 Bearer)。
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
        max_tokens: 1024, // profile 上限 ~2000 字符,留足额度
        system,
        messages: [{ role: 'user', content: user }],
        // 抽取是结构化摘要,强制关 thinking(同 titleService):防带 thinking 的上游把预算耗在
        // thinking 块上导致 text 为空。{type:'disabled'} 对 Anthropic / deepseek-anthropic 均合法。
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.warn(
        `[memoryService] runCheapCall failed: ${response.status} ${response.statusText} ` +
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

    return text.trim() || null
  } catch (err) {
    console.warn(`[memoryService] runCheapCall error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

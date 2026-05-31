import type { MessageBuffer } from '../common/message-buffer.js'
import type { DingTalkAiCardInstance } from './ai-card.js'

export type DingTalkStreamingState = {
  aiCardBuffers: Map<string, MessageBuffer>
  streamingCards: Map<string, Promise<DingTalkAiCardInstance | null>>
  streamingCardText: Map<string, string>
}

export function resetDingTalkStreamingState(
  state: DingTalkStreamingState,
  chatId: string,
): void {
  state.aiCardBuffers.get(chatId)?.reset()
  state.aiCardBuffers.delete(chatId)
  state.streamingCards.delete(chatId)
  state.streamingCardText.delete(chatId)
}

export async function finishAndResetDingTalkStreamingState(
  state: DingTalkStreamingState,
  chatId: string,
): Promise<void> {
  await state.aiCardBuffers.get(chatId)?.complete()
  resetDingTalkStreamingState(state, chatId)
}

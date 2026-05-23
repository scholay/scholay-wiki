/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * messageUtils - 消息处理工具函数
 */

export interface ChatMessage {
  id: string | number;
  message_id?: string;
  parent_message_id?: string | null;
  role: 'user' | 'assistant' | string;
  content: string;
  created_at: string | number | Date;
  suggested_questions?: string[];
  // any: messages carry varying server-side fields not modeled here.
  [key: string]: any;
}

export interface QAPair {
  question: string;
  answer: string;
  suggested_questions: string[];
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export const organizeMessagesByParentId = (messages: ChatMessage[]): ChatMessage[] => {
  if (!messages || messages.length === 0) return [];

  const hasParentIds = messages.some(m => m.parent_message_id);

  if (!hasParentIds) {
    return messages;
  }

  const messageMap: Record<string, ChatMessage> = {};
  messages.forEach(msg => {
    if (msg.message_id) messageMap[msg.message_id] = msg;
  });

  const rootMessages = messages.filter(m => m.role === 'user' && !m.parent_message_id);

  const organized: ChatMessage[] = [];
  const processedIds = new Set<string | number>();

  const addMessageAndChildren = (msg: ChatMessage): void => {
    if (processedIds.has(msg.id)) return;

    organized.push(msg);
    processedIds.add(msg.id);

    const children = messages.filter(
      m => m.parent_message_id === msg.message_id && !processedIds.has(m.id)
    );

    children.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    children.forEach(child => {
      addMessageAndChildren(child);
    });
  };

  rootMessages.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  rootMessages.forEach(rootMsg => {
    addMessageAndChildren(rootMsg);
  });

  messages.forEach(msg => {
    if (!processedIds.has(msg.id)) {
      organized.push(msg);
    }
  });

  return organized;
};

export const messagesToQAList = (messages: ChatMessage[]): QAPair[] => {
  const list: QAPair[] = [];
  let currentUserMessage: ChatMessage | null = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      currentUserMessage = msg;
    } else if (msg.role === 'assistant' && currentUserMessage) {
      list.push({
        question: currentUserMessage.content,
        answer: msg.content,
        suggested_questions: msg.suggested_questions || [],
        userMessage: currentUserMessage,
        assistantMessage: msg,
      });
      currentUserMessage = null;
    }
  }

  return list;
};

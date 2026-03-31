export interface Conversation {
  id: number;
  user_id: number;
  title: string;
  conversation_type: 'search' | 'chat' | 'analysis';
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parent_id?: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface FollowUpQuestion {
  id: string;
  question: string;
}

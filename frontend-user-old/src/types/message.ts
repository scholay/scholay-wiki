export type MessageCategory = 'system' | 'payment' | 'subscription' | 'promotion' | 'general';

export interface Message {
  id: number;
  user_id: number;
  title: string;
  content: string;
  category: MessageCategory;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export interface UnreadCount {
  total: number;
  by_category: Record<MessageCategory, number>;
}

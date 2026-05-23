export interface SubscriptionPlan {
  id: number;
  name: string;
  display_name: string;
  description: string;
  price: number;
  original_price?: number;
  duration_days: number;
  features: string[];
  sort_order: number;
  is_active: boolean;
}

export interface UserSubscription {
  id: number;
  user_id: number;
  plan_id: number;
  plan_name: string;
  status: 'active' | 'expired' | 'cancelled';
  start_date: string;
  end_date: string;
  auto_renew: boolean;
}

export interface UsageQuota {
  conversation_limit: number;
  conversation_used: number;
  search_limit: number;
  search_used: number;
  advanced_search_limit: number;
  advanced_search_used: number;
  pdf_preview_limit: number;
  pdf_preview_used: number;
}

export interface Coupon {
  id: number;
  template_id: number;
  code: string;
  name: string;
  discount_type: 'percentage' | 'fixed' | 'price_off';
  discount_value: number;
  min_amount?: number;
  status: 'unused' | 'reserved' | 'used' | 'expired' | 'cancelled';
  valid_from: string;
  valid_to: string;
}

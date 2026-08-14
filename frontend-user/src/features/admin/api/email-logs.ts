// 发送记录(邮件 + 短信)—— admin hooks。字段对齐 backend/internal/emaillog。
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export type SendChannel = 'email' | 'sms';

export interface EmailLog {
  id: number;
  channel: SendChannel;
  to_email: string; // email: 收件邮箱 / sms: 手机号
  subject: string; // email: 主题 / sms: 模板内容
  category: string; // verification|feedback|billing|test|other
  from_email: string;
  from_name: string; // email: 发件人名 / sms: 短信签名
  status: 'success' | 'failed';
  error: string;
  created_at: string;
}

export interface EmailLogStats {
  total: number;
  success: number;
  failed: number;
}

export interface EmailLogParams {
  channel?: SendChannel; // email | sms
  status?: string; // ''|'success'|'failed'
  category?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export function useEmailLogs(params: EmailLogParams) {
  return useQuery({
    queryKey: ['admin', 'email-logs', params],
    // 分页参数在 key 里,翻页保留上一页数据,避免列表塌空闪白(2026-08-12 审计)。
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await http.get<{ data: { logs: EmailLog[]; total: number; stats: EmailLogStats } }>(
        '/admin/email-logs',
        { params },
      );
      return {
        logs: r.data.data.logs ?? [],
        total: r.data.data.total ?? 0,
        stats: r.data.data.stats ?? { total: 0, success: 0, failed: 0 },
      };
    },
    // 典型用法是「让用户再点一次发送验证码,我盯着这页看有没有记录进来」——
    // 全局 refetchOnWindowFocus 关着,不自动重取就只能整页 F5。
    refetchInterval: 30_000,
  });
}

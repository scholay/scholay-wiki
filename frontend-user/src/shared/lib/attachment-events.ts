/**
 * 「附件存储空间已满 / 想管理自己的附件」的全前端单一出口。
 *
 * 仿 quota-events 的 window 事件模式(保持 shared/lib 纯净:不依赖 store / react)。
 *
 * 为什么需要它:后端的 per-user 附件额度(2GB)撞上之后,用户**没有任何自救手段** ——
 * 「新开一个对话」只对会话 cwd 的 1GB 帽有效,对 per-user 帽完全无效。一句他做不到的
 * 指引比不给指引更糟。所以 7010 必须能把用户直接送到「删掉旧附件」这个动作上:
 * http 拦截器拿到 7010 → 广播本事件 → 挂在 providers 的 AttachmentManagerDialog 打开。
 *
 * 同一个弹窗也由输入框「+」→「我的附件」主动打开(不撞墙也能管理),
 * 于是「在附件管理里删掉不用的文件」这句话在**所有**文案里都是可执行的。
 */
export const ATTACHMENT_MANAGER_EVENT = 'scholay:attachment-manager';

/** 后端 errcode.AttachmentQuotaExceeded —— per-user 附件存储额度已满。 */
export const ATTACHMENT_QUOTA_HTTP_CODE = 7010;

export interface AttachmentManagerDetail {
  /** 撞额度时的后端文案(弹窗顶部原样展示);主动打开时为空。 */
  message?: string;
  /** true = 因为撞了额度被动弹出(弹窗会强调「删几个再重试」)。 */
  quotaExceeded?: boolean;
}

/** 载荷 code 是否为「附件额度已满」。 */
export function isAttachmentQuotaSignal(
  signal: { code?: number | string | null } | null | undefined,
): boolean {
  return signal?.code === ATTACHMENT_QUOTA_HTTP_CODE;
}

/** 打开「我的附件」弹窗(撞额度自动触发,或用户从「+」菜单主动打开)。 */
export function openAttachmentManager(detail?: AttachmentManagerDetail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ATTACHMENT_MANAGER_EVENT, { detail }));
  }
}

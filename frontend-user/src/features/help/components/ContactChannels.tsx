import { Mail, Briefcase, QrCode } from 'lucide-react';
import { useSupportContact } from '../api/contact';

/**
 * 紧凑「其他联系方式」卡 —— 配置驱动(后台「客服配置」),给反馈页/关于页等做表单之外的备选渠道。
 * 联系邮箱、商务邮箱、群二维码全部来自 useSupportContact();任一项未配置则自然隐藏。
 * 未配置任何渠道(连支持邮箱都没有)时整块不渲染,避免空卡。
 *
 * 与 ContactPage 的大渠道卡同源数据,这里走轻量竖排版,适合放表单侧栏。
 */

// 后台未配置时的回落支持邮箱(与 ContactPage 一致,保证页面永远有个兜底联系方式)。
const FALLBACK_SUPPORT_EMAIL = 'support@scholay.com';

export function ContactChannels({ className }: { className?: string }) {
  const { data } = useSupportContact();
  const supportEmail = data?.support_email || FALLBACK_SUPPORT_EMAIL;
  const businessEmail = data?.business_email || '';
  const note = data?.contact_note || '';
  const qrs = [
    { title: '企业微信', src: data?.wecom_qr },
    { title: '飞书', src: data?.feishu_qr },
  ].filter((q): q is { title: string; src: string } => !!q.src);

  return (
    <section className={'rounded-12 border border-border-soft bg-surface-card p-5 ' + (className ?? '')}>
      <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-foreground">
        <Mail className="size-4 text-brand-red" strokeWidth={2.2} />
        其他联系方式
      </h2>

      <div className="flex flex-col gap-2">
        <EmailRow icon={<Mail className="size-3.5" />} label="产品支持" email={supportEmail} />
        {businessEmail && (
          <EmailRow icon={<Briefcase className="size-3.5" />} label="商务合作" email={businessEmail} />
        )}
      </div>

      {qrs.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 inline-flex items-center gap-1.5 text-2xs font-medium text-faint">
            <QrCode className="size-3" />
            扫码联系
          </p>
          <div className="flex flex-wrap gap-3">
            {qrs.map((q) => (
              <figure key={q.title} className="flex flex-col items-center gap-1">
                <img
                  src={q.src}
                  alt={`${q.title}二维码`}
                  className="size-24 rounded-8 border border-border object-contain"
                />
                <figcaption className="text-2xs text-faint">{q.title}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {note && <p className="mt-3 text-2xs leading-paragraph text-muted-foreground">{note}</p>}
    </section>
  );
}

function EmailRow({ icon, label, email }: { icon: React.ReactNode; label: string; email: string }) {
  return (
    <a
      href={`mailto:${email}`}
      className="group flex items-center gap-2.5 rounded-8 border border-border-soft bg-surface-1 px-3 py-2 transition-colors hover:border-foreground/30 hover:bg-surface-2"
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-4 bg-surface-card text-subtle group-hover:text-brand-red">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-2xs text-faint">{label}</span>
        <span className="truncate text-xs font-medium text-subtle group-hover:text-foreground">{email}</span>
      </span>
    </a>
  );
}

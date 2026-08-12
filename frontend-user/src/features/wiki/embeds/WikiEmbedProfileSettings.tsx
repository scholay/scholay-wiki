/**
 * 桌面端个人资料编辑页的已加载状态 · 纯样式 fixture。
 * 来源：current settings/pages/ProfilePage.tsx；移动端表单不与桌面态并排拼接。
 */
export function WikiEmbedProfileSettings() {
  return (
    <div
      className="flex w-full max-w-2xl flex-col"
      style={{ gap: 20 }}
      aria-hidden
      data-wiki-fixture="profile-settings"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-16 font-medium text-foreground">个人资料</h2>
        <p className="text-12 text-muted-foreground">
          这里填的内容会出现在你的公开主页和评论里。
        </p>
      </div>

      <ProfileField label="昵称">
        <div className="flex h-10 w-full items-center rounded-8 border border-border bg-surface-card px-3 text-14 text-foreground">
          一位正在研究的学者
        </div>
      </ProfileField>

      <ProfileField label="简介">
        <div className="flex min-h-20 w-full items-start rounded-8 border border-border bg-surface-card px-3 py-2 text-14 leading-paragraph text-foreground">
          关注学术检索、科研写作与开放科学。
        </div>
      </ProfileField>

      <ProfileField label="头像图片地址">
        <div className="flex h-10 w-full items-center rounded-8 border border-border bg-surface-card px-3 text-14 text-foreground">
          https://example.com/avatar.jpg
        </div>
      </ProfileField>

      <div>
        <span className="inline-flex h-8 items-center justify-center rounded-pill bg-primary px-3 text-14 font-medium text-primary-foreground">
          保存
        </span>
      </div>
    </div>
  );
}

function ProfileField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-12 font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}

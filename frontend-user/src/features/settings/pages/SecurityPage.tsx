import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { useApiToast } from '@/shared/hooks';
import { Button, Input } from '@/shared/ui';
import { useProfile } from '@/features/auth/api/profile';
import { SendCodeButton } from '@/features/auth/components/SendCodeButton';

/**
 * 安全设置:
 *   1. 修改密码(POST /user/change-password)
 *   2. 换绑 / 绑定邮箱(POST /user/bind-email,后端验证码 + 重复检查 + 解绑保护)
 *   3. 换绑 / 绑定手机号(POST /user/bind-phone)
 *
 * 「换绑」就是 bind-* 接口(后端逻辑会覆盖旧值)。
 * 「解绑」需要旧 email/phone 验证码,目前 backend unbind 已带保护。
 *   本页 MVP:不直接做 unbind,改邮箱用 bind 直接覆盖即可。
 */
export function SecurityPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const apiToast = useApiToast();

  // 密码
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const changePwd = useMutation({
    mutationFn: async () => {
      if (newPwd !== confirmPwd) throw new Error('两次输入的新密码不一样,请重新输入');
      if (newPwd.length < 8) throw new Error('新密码至少要 8 位');
      try {
        await http.post('/user/change-password', { old_password: oldPwd, new_password: newPwd });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      toast.success('密码已更新,下次登录请使用新密码');
    },
    onError: apiToast.onError('密码没能修改成功,请确认当前密码是否填对了'),
  });

  // 换绑邮箱:
  //   - profile.email 为空 → 首次绑定,只需新邮箱验证码
  //   - profile.email 已有 → 换绑,需要 *两份* 验证码(新邮箱 bind + 旧邮箱 change_email)
  //     防止 session 被偷后被攻击者改邮箱接管账号(P2 安全洞)
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [oldEmailCode, setOldEmailCode] = useState('');
  const hasExistingEmail = !!profile?.email;

  const bindEmail = useMutation({
    mutationFn: async () => {
      try {
        await http.post('/user/bind-email', {
          email: newEmail,
          code: emailCode,
          old_email_code: hasExistingEmail ? oldEmailCode : undefined,
        });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      setNewEmail('');
      setEmailCode('');
      setOldEmailCode('');
      qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
      qc.invalidateQueries({ queryKey: ['settings', 'connections'] });
      toast.success('邮箱已更新');
    },
    onError: apiToast.onError('邮箱换绑没成功,请稍后重试'),
  });

  // 换绑手机:对称于换绑邮箱 —— 已绑场景必须验旧手机码 + 新手机码
  const [newPhone, setNewPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [oldPhoneCode, setOldPhoneCode] = useState('');
  const hasExistingPhone = !!profile?.phone;

  const bindPhone = useMutation({
    mutationFn: async () => {
      try {
        await http.post('/user/bind-phone', {
          phone: newPhone,
          code: phoneCode,
          old_phone_code: hasExistingPhone ? oldPhoneCode : undefined,
        });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      setNewPhone('');
      setPhoneCode('');
      setOldPhoneCode('');
      qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
      qc.invalidateQueries({ queryKey: ['settings', 'connections'] });
      toast.success('手机号已更新');
    },
    onError: apiToast.onError('手机号换绑没成功,请稍后重试'),
  });

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* 修改密码 */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-16 font-medium text-foreground">修改密码</h2>
          <p className="text-12 text-muted-foreground mt-1">为了账号安全,建议使用 8 位以上、字母数字混合的密码。</p>
        </div>
        <Input
          type="password"
          value={oldPwd}
          onChange={(e) => setOldPwd(e.target.value)}
          placeholder="当前密码"
          className="h-10"
        />
        <Input
          type="password"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
          placeholder="新密码(至少 8 位)"
          className="h-10"
        />
        <Input
          type="password"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
          placeholder="再次输入新密码"
          className="h-10"
        />
        <div>
          <Button
            type="button"
            onClick={() => changePwd.mutate()}
            disabled={changePwd.isPending || !oldPwd || !newPwd}
          >
            {changePwd.isPending ? '提交中…' : '修改密码'}
          </Button>
        </div>
      </section>

      <div className="border-t border-border-soft" />

      {/* 换绑邮箱 */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-16 font-medium text-foreground">
            {hasExistingEmail ? '换绑邮箱' : '绑定邮箱'}
          </h2>
          <p className="text-12 text-muted-foreground mt-1">
            当前邮箱:
            <span className="font-mono ml-1">{profile?.email || '还没有绑定'}</span>
          </p>
        </div>

        {/* 换绑场景:先给旧邮箱发码,确认是本人操作 —— 防 session 被偷夺号 */}
        {hasExistingEmail && (
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              maxLength={6}
              value={oldEmailCode}
              onChange={(e) => setOldEmailCode(e.target.value)}
              placeholder={`输入发送到当前邮箱 ${profile?.email} 的 6 位验证码`}
              className="h-10 flex-1"
            />
            <SendCodeButton
              accountType="email"
              account={profile!.email!}
              purpose="change_email"
              validate={() => true}
            />
          </div>
        )}

        <Input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="新邮箱"
          className="h-10"
        />
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            maxLength={6}
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value)}
            placeholder="输入发送到新邮箱的 6 位验证码"
            className="h-10 flex-1"
          />
          <SendCodeButton
            accountType="email"
            account={newEmail}
            purpose="bind"
            validate={() => /\S+@\S+\.\S+/.test(newEmail)}
          />
        </div>
        <div>
          <Button
            type="button"
            onClick={() => bindEmail.mutate()}
            disabled={
              bindEmail.isPending ||
              !newEmail ||
              !emailCode ||
              (hasExistingEmail && !oldEmailCode)
            }
          >
            {bindEmail.isPending
              ? '提交中…'
              : hasExistingEmail
                ? '换绑邮箱'
                : '绑定邮箱'}
          </Button>
        </div>
      </section>

      <div className="border-t border-border-soft" />

      {/* 换绑手机 */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-16 font-medium text-foreground">
            {hasExistingPhone ? '换绑手机号' : '绑定手机号'}
          </h2>
          <p className="text-12 text-muted-foreground mt-1">
            当前手机号:
            <span className="font-mono ml-1">{profile?.phone || '还没有绑定'}</span>
          </p>
        </div>

        {/* 换绑场景:先验旧手机所有权,与换绑邮箱对称 */}
        {hasExistingPhone && (
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              maxLength={6}
              value={oldPhoneCode}
              onChange={(e) => setOldPhoneCode(e.target.value)}
              placeholder={`输入发送到当前手机 ${profile?.phone} 的 6 位验证码`}
              className="h-10 flex-1"
            />
            <SendCodeButton
              accountType="phone"
              account={profile!.phone!}
              purpose="change_phone"
              validate={() => true}
            />
          </div>
        )}

        <Input
          type="tel"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          placeholder="新手机号"
          className="h-10"
        />
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            maxLength={6}
            value={phoneCode}
            onChange={(e) => setPhoneCode(e.target.value)}
            placeholder="输入发送到新手机的 6 位验证码"
            className="h-10 flex-1"
          />
          <SendCodeButton
            accountType="phone"
            account={newPhone}
            purpose="bind"
            validate={() => /^1[3-9]\d{9}$/.test(newPhone)}
          />
        </div>
        <div>
          <Button
            type="button"
            onClick={() => bindPhone.mutate()}
            disabled={
              bindPhone.isPending ||
              !newPhone ||
              !phoneCode ||
              (hasExistingPhone && !oldPhoneCode)
            }
          >
            {bindPhone.isPending
              ? '提交中…'
              : hasExistingPhone
                ? '换绑手机号'
                : '绑定手机号'}
          </Button>
        </div>
      </section>
    </div>
  );
}

export default SecurityPage;

'use client';
/**
 * 忘记密码页
 *
 * 对标原 Vue 2 /retrieve-password 页面。
 * 通过手机号+短信验证码重置密码。
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ofetch } from 'ofetch';
import { sm2 } from 'sm-crypto';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [mobile, setMobile] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // 短信倒计时
  useEffect(() => {
    if (smsCountdown <= 0) return;
    const timer = setTimeout(() => setSmsCountdown(smsCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [smsCountdown]);

  const handleSendSms = async () => {
    if (!mobile) { setError('请输入手机号'); return; }
    setSendingSms(true);
    try {
      const res = await ofetch('/api/auth/sms', { method: 'POST', body: { mobile } });
      if (res.code === 0) {
        setSmsCountdown(60);
        setError('');
      } else {
        setError(res.msg || '发送失败');
      }
    } catch {
      setError('发送失败');
    } finally {
      setSendingSms(false);
    }
  };

  const handleReset = async () => {
    if (!smsCode) { setError('请输入短信验证码'); return; }
    if (!newPassword || newPassword.length < 6) { setError('密码至少6位'); return; }

    setLoading(true);
    setError('');

    try {
      const isDev = process.env.NODE_ENV === 'development';
      let encryptedPassword = newPassword;

      if (!isDev) {
        try {
          const pubConfig = await ofetch('/api/auth/pub-config');
          const publicKey = pubConfig?.data?.sm2PublicKey;
          if (publicKey) encryptedPassword = sm2.doEncrypt(newPassword, publicKey, 1);
        } catch { /* 降级明文 */ }
      }

      const res = await ofetch('/api/auth/reset-password', {
        method: 'PUT',
        body: { mobile, smsCode, password: encryptedPassword },
      });

      if (res.code === 0) {
        setSuccess(true);
      } else {
        setError(res.msg || '重置失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="shadow-lg">
        <CardContent className="pt-6 space-y-4 text-center">
          <div className="text-green-600 text-lg font-semibold">密码重置成功</div>
          <Button className="w-full" onClick={() => router.push('/login')}>前往登录</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">忘记密码</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input placeholder="手机号" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        <div className="flex gap-2">
          <Input placeholder="短信验证码" value={smsCode} onChange={(e) => setSmsCode(e.target.value)} className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleSendSms} disabled={sendingSms || smsCountdown > 0} className="flex-shrink-0">
            {smsCountdown > 0 ? `${smsCountdown}s` : '发送验证码'}
          </Button>
        </div>
        <Input type="password" placeholder="新密码（至少6位）" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={handleReset} disabled={loading}>
          {loading ? '重置中...' : '重置密码'}
        </Button>
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">返回登录</Link>
        </p>
      </CardContent>
    </Card>
  );
}

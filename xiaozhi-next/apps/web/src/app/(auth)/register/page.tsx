'use client';
/**
 * 注册页
 *
 * 对标原 Vue 2 /register 页面。
 * 支持手机号+短信验证码 或 用户名+密码 两种方式。
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ofetch } from 'ofetch';
import { sm2 } from 'sm-crypto';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();

  // ── 表单状态 ──
  const [mode, setMode] = useState<'username' | 'phone'>('phone');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // ── 发送短信验证码倒计时 ──
  useEffect(() => {
    if (smsCountdown <= 0) return;
    const timer = setTimeout(() => setSmsCountdown(smsCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [smsCountdown]);

  // ── 发送短信 ──
  const handleSendSms = async () => {
    if (!mobile) { setError('请输入手机号'); return; }
    setSendingSms(true);
    setError('');
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

  // ── 注册 ──
  const handleRegister = async () => {
    if (mode === 'phone' && !smsCode) { setError('请输入短信验证码'); return; }
    if (!password) { setError('请输入密码'); return; }
    if (password !== confirmPassword) { setError('两次密码不一致'); return; }

    setLoading(true);
    setError('');

    try {
      // ── 开发模式：密码直传明文，跳过 SM2 ──
      const isDev = process.env.NODE_ENV === 'development';
      let encryptedPassword = password;

      if (!isDev) {
        try {
          const pubConfig = await ofetch('/api/auth/pub-config');
          const publicKey = pubConfig?.data?.sm2PublicKey;
          if (publicKey) {
            encryptedPassword = sm2.doEncrypt(password, publicKey, 1);
          }
        } catch { /* SM2 不可用时使用明文 */ }
      }

      const body: any = {
        password: encryptedPassword,
        ...(mode === 'phone' ? { mobile, smsCode } : { username }),
      };

      const res = await ofetch('/api/auth/register', { method: 'POST', body });
      if (res.code === 0) {
        setSuccess(true);
      } else {
        setError(res.msg || '注册失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="shadow-md border">
        <CardContent className="pt-6 space-y-4 text-center">
          <div className="text-emerald-600 text-lg font-semibold">注册成功</div>
          <p className="text-muted-foreground text-sm">您现在可以使用账号登录系统。</p>
          <Button className="w-full h-9" onClick={() => router.push('/login')}>前往登录</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border">
      <CardHeader className="text-center pb-4">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center mx-auto mb-3">
          <span className="text-primary-foreground text-sm font-bold">XZ</span>
        </div>
        <CardTitle className="text-xl">注册账号</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 模式切换 */}
        <div className="flex gap-1 p-0.5 bg-muted rounded-md">
          <Button variant={mode === 'phone' ? 'default' : 'ghost'} size="sm" className="flex-1 h-7 text-xs font-medium" onClick={() => setMode('phone')}>手机注册</Button>
          <Button variant={mode === 'username' ? 'default' : 'ghost'} size="sm" className="flex-1 h-7 text-xs font-medium" onClick={() => setMode('username')}>用户名注册</Button>
        </div>

        {mode === 'username' && (
          <Input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
        )}
        {mode === 'phone' && (
          <>
            <Input placeholder="手机号" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            <div className="flex gap-2">
              <Input placeholder="短信验证码" value={smsCode} onChange={(e) => setSmsCode(e.target.value)} className="flex-1" />
              <Button variant="outline" size="sm" onClick={handleSendSms} disabled={sendingSms || smsCountdown > 0} className="flex-shrink-0 h-8">
                {smsCountdown > 0 ? `${smsCountdown}s` : '发送验证码'}
              </Button>
            </div>
          </>
        )}

        <Input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input type="password" placeholder="确认密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full h-9" onClick={handleRegister} disabled={loading}>
          {loading ? '注册中...' : '注 册'}
        </Button>

        <p className="text-center text-sm">
          已有账号？<Link href="/login" className="text-primary hover:underline text-xs">立即登录</Link>
        </p>
      </CardContent>
    </Card>
  );
}

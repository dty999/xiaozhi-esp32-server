'use client';
/**
 * 登录页
 *
 * 对标原 Vue 2 /login 页面。
 * 支持用户名/手机号两种模式，SM2 加密密码 + 图形验证码。
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ofetch } from 'ofetch';
import { sm2 } from 'sm-crypto';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { setToken, setUser } = useAuthStore();

  // ── 表单状态 ──
  const [mode, setMode] = useState<'username' | 'phone'>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaUuid, setCaptchaUuid] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── 获取验证码 ──
  const fetchCaptcha = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/captcha');
      const svg = await res.text();
      const uuid = res.headers.get('X-Captcha-Uuid') || res.headers.get('x-captcha-uuid') || '';
      setCaptchaSvg(svg);
      setCaptchaUuid(uuid);
    } catch {
      setError('验证码加载失败');
    }
  }, []);

  useEffect(() => { fetchCaptcha(); }, [fetchCaptcha]);

  // ── 登录逻辑 ──
  const handleLogin = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    setError('');

    try {
      // ── 开发模式：密码直传明文，跳过 SM2 与验证码 ──
      const isDev = process.env.NODE_ENV === 'development';

      let sendPassword = password;
      let sendCaptchaId = '';

      if (!isDev) {
        // 生产模式：SM2 加密
        const pubConfig = await ofetch('/api/auth/pub-config');
        const publicKey = pubConfig?.data?.sm2PublicKey;
        if (publicKey) {
          const captchaPassword = `${captcha}:${password}`;
          sendPassword = sm2.doEncrypt(captchaPassword, publicKey, 1);
          sendCaptchaId = captchaUuid;
        }
      }

      const res = await ofetch('/api/auth/login', {
        method: 'POST',
        body: {
          username,
          password: sendPassword,
          captchaId: sendCaptchaId,
        },
      });

      if (res.code === 0) {
        setToken(res.data.token);
        setUser(res.data.userInfo);
        router.push('/home');
      } else {
        setError(res.msg || '登录失败');
        fetchCaptcha();
      }
    } catch (e: any) {
      setError(e.message || '网络错误');
      fetchCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-md border">
      <CardHeader className="text-center pb-4">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center mx-auto mb-3">
          <span className="text-primary-foreground text-sm font-bold">XZ</span>
        </div>
        <CardTitle className="text-xl">控制台</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">ESP32 AI 智能体管理</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 模式切换 */}
        <div className="flex gap-1 p-0.5 bg-muted rounded-md">
          <Button
            variant={mode === 'username' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMode('username')}
            className="flex-1 h-7 text-xs font-medium"
          >
            用户名登录
          </Button>
          <Button
            variant={mode === 'phone' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMode('phone')}
            className="flex-1 h-7 text-xs font-medium"
          >
            手机号登录
          </Button>
        </div>

        <Input
          placeholder={mode === 'username' ? '用户名' : '手机号'}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />

        {/* 验证码 */}
        <div className="flex gap-2">
          <Input
            placeholder="验证码"
            value={captcha}
            onChange={(e) => setCaptcha(e.target.value)}
            className="flex-1"
          />
          <div
            className="w-28 h-9 cursor-pointer border rounded-md overflow-hidden flex-shrink-0"
            dangerouslySetInnerHTML={{ __html: captchaSvg }}
            onClick={fetchCaptcha}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full h-9" onClick={handleLogin} disabled={loading}>
          {loading ? '登录中...' : '登 录'}
        </Button>

        <div className="flex justify-between text-sm">
          <Link href="/register" className="text-primary hover:underline text-xs">注册账号</Link>
          <Link href="/forgot-password" className="text-primary hover:underline text-xs">忘记密码</Link>
        </div>
      </CardContent>
    </Card>
  );
}

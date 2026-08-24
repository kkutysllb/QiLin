'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { authApi } from '@/lib/api';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';
import { toast } from 'sonner';
import {
  Loader2,
  ExternalLink,
  ShieldCheck,
  LogIn,
  KeyRound
} from 'lucide-react';

type Mode = 'loading' | 'login' | 'register' | 'initialize';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('loading');
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authApi
      .setupStatus()
      .then((s) => {
        if (s.needs_setup) {
          setMode('initialize');
        } else {
          setMode('login');
          setRegistrationEnabled(s.registration_enabled);
        }
      })
      .catch(() => setMode('login'));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'initialize') {
        if (password !== confirmPassword) throw new Error('两次密码不一致');
        if (password.length < 12) throw new Error('密码至少 12 位');
        await authApi.initialize({ email, password });
        toast.success('管理员账户已创建,正在登录…');
        router.push('/');
        return;
      }
      if (mode === 'login') {
        await authApi.login({ username, password });
        toast.success('登录成功');
        router.push('/');
        return;
      }
      if (mode === 'register') {
        const r = await fetch(`${GATEWAY_BASE_URL}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
          credentials: 'include'
        });
        if (!r.ok) {
          const detail = await r.json().catch(() => ({}));
          throw new Error(detail?.detail?.message ?? `HTTP ${r.status}`);
        }
        toast.success('注册成功,正在登录…');
        await authApi.login({ username, password });
        router.push('/');
        return;
      }
    } catch (err) {
      const verb = mode === 'initialize' ? '创建' : mode === 'login' ? '登录' : '注册';
      toast.error(`${verb}失败: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const titles: Record<Mode, { title: string; desc: string; icon: typeof LogIn }> = {
    loading: { title: '', desc: '', icon: Loader2 },
    initialize: {
      title: '初始化 QiLin',
      desc: '这是首次启动 — 创建管理员账户',
      icon: ShieldCheck
    },
    login: { title: '登录 QiLin', desc: '使用本地账户登录', icon: LogIn },
    register: { title: '注册账户', desc: '创建新的本地账户', icon: KeyRound }
  };
  const t = titles[mode];
  const Icon = t.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-qilin-500">
            <Icon className="h-5 w-5 text-white" />
          </div>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'initialize' && (
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="admin@example.com"
                />
              </div>
            )}
            {(mode === 'login' || mode === 'register') && (
              <div className="space-y-2">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
            )}
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {mode === 'initialize' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="confirm">确认密码</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  密码 ≥ 12 位,需包含大小写字母、数字与符号(系统会强制校验)
                </p>
              </>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={
                submitting ||
                !password ||
                (mode !== 'initialize' && !username) ||
                (mode === 'initialize' && !email)
              }
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icon className="mr-2 h-4 w-4" />
              )}
              {mode === 'initialize' ? '创建并登录' : mode === 'login' ? '登录' : '注册'}
            </Button>
          </form>

          <div className="mt-4 flex flex-col items-center gap-2 text-xs">
            {mode === 'login' && registrationEnabled && (
              <button
                onClick={() => setMode('register')}
                className="text-qilin-400 underline-offset-4 hover:underline"
              >
                还没有账户?注册一个
              </button>
            )}
            {mode === 'register' && (
              <button
                onClick={() => setMode('login')}
                className="text-qilin-400 underline-offset-4 hover:underline"
              >
                已有账户?返回登录
              </button>
            )}
            <a
              href={`${GATEWAY_BASE_URL}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              查看 Gateway API 文档
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

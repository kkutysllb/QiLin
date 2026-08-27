"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  AuthShell,
  authErrorClass,
  authFieldClass,
  authLabelClass,
  authSubmitClass,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/core/auth/AuthProvider";
import { getDesktopAuthHeaders, setDesktopSessionToken } from "@/core/auth/session";
import { type LoginResponse, parseAuthError } from "@/core/auth/types";
import { getBackendBaseURL, isDesktop } from "@/core/config";
import { cn } from "@/lib/utils";

/**
 * Validate next parameter
 * Prevent open redirect attacks
 * Per RFC-001: Only allow relative paths starting with /
 */
function validateNextParam(next: string | null): string | null {
  if (!next) {
    return null;
  }

  // Need start with / (relative path)
  if (!next.startsWith("/")) {
    return null;
  }

  // Disallow protocol-relative URLs
  if (
    next.startsWith("//") ||
    next.startsWith("http://") ||
    next.startsWith("https://")
  ) {
    return null;
  }

  // Disallow URLs with different protocols (e.g., javascript:, data:, etc)
  if (next.includes(":") && !next.startsWith("/")) {
    return null;
  }

  // Valid relative path
  return next;
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, refreshUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Get next parameter for validated redirect
  const nextParam = searchParams.get("next");
  const redirectPath = validateNextParam(nextParam) ?? "/workspace";

  // Only check setup-status when user opens login page directly (no next param).
  // When redirected from a protected page due to session expiry, the system
  // is already set up — skip this check to avoid bouncing to /setup.
  const isRedirected = nextParam !== null;

  // Redirect if already authenticated (client-side, post-login)
  useEffect(() => {
    if (isAuthenticated) {
      router.push(redirectPath);
    }
  }, [isAuthenticated, redirectPath, router]);

  // Redirect to setup if the system has no users yet (only on direct access, not re-auth)
  useEffect(() => {
    if (isRedirected) return; // System already set up, skip setup check

    let cancelled = false;

    void fetch(`${getBackendBaseURL()}/api/v1/auth/setup-status`)
      .then((r) => r.json())
      .then((data: { needs_setup?: boolean }) => {
        if (!cancelled && data.needs_setup) {
          router.push("/setup");
        }
      })
      .catch(() => {
        // Ignore errors; user stays on login page
      });

    return () => {
      cancelled = true;
    };
  }, [isRedirected, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isLogin
        ? "/api/v1/auth/login/local"
        : "/api/v1/auth/register";
      const body = isLogin
        ? `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
        : JSON.stringify({ email, password });

      const desktopHeaders = getDesktopAuthHeaders();
      const headers: HeadersInit = isLogin
        ? {
            "Content-Type": "application/x-www-form-urlencoded",
            ...desktopHeaders,
          }
        : { "Content-Type": "application/json", ...desktopHeaders };

      const res = await fetch(`${getBackendBaseURL()}${endpoint}`, {
        method: "POST",
        headers,
        body,
        credentials: "include", // Important: include HttpOnly cookie
      });

      if (!res.ok) {
        const data = await res.json();
        const authError = parseAuthError(data);
        setError(authError.message);
        return;
      }

      const data = (await res.json()) as LoginResponse;
      if (isDesktop() && data.access_token) {
        setDesktopSessionToken(data.access_token);
      }

      // Both login and register set a cookie — redirect to workspace
      await refreshUser();
      router.refresh();
      router.push(redirectPath);
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={isLogin ? "登录控制台" : "创建账户"}
      subtitle={isLogin ? "登录您的账户" : "创建新账户"}
    >
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-col space-y-1">
          <label htmlFor="email" className={authLabelClass}>
            邮箱
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱地址"
            required
            className={authFieldClass}
          />
        </div>
        <div className="flex flex-col space-y-1">
          <label htmlFor="password" className={authLabelClass}>
            密码
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            required
            minLength={isLogin ? 6 : 8}
            className={authFieldClass}
          />
        </div>

        {error && <p className={cn("text-sm", authErrorClass)}>{error}</p>}

        <Button type="submit" className={authSubmitClass} disabled={loading}>
          {loading ? "请稍候…" : isLogin ? "登录" : "创建账户"}
        </Button>
      </form>

      <div className="text-center text-sm">
        <button
          type="button"
          onClick={() => {
            setIsLogin(!isLogin);
            setError("");
          }}
          className="text-ql-gold-300 transition-colors hover:text-ql-gold-500 hover:underline"
        >
          {isLogin ? "没有账户？立即注册" : "已有账户？立即登录"}
        </button>
      </div>

      <div className="text-center text-xs">
        <Link
          href="/"
          className="text-ql-ink-low transition-colors hover:text-ql-ink-mid hover:underline"
        >
          ← 返回首页
        </Link>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

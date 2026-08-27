"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AuthShell,
  authErrorClass,
  authFieldClass,
  authLabelClass,
  authSubmitClass,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetch, getCsrfHeaders } from "@/core/api/fetcher";
import { useAuth } from "@/core/auth/AuthProvider";
import { getDesktopAuthHeaders, setDesktopSessionToken } from "@/core/auth/session";
import { type LoginResponse, parseAuthError } from "@/core/auth/types";
import { getBackendBaseURL, isDesktop } from "@/core/config";
import { cn } from "@/lib/utils";

type SetupMode = "loading" | "init_admin" | "change_password";

export default function SetupPage() {
  const router = useRouter();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const [mode, setMode] = useState<SetupMode>("loading");

  // --- Shared state ---
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Change-password mode only ---
  const [currentPassword, setCurrentPassword] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (isAuthenticated && user?.needs_setup) {
      setMode("change_password");
    } else if (!isAuthenticated) {
      // Check if the system has no users yet
      void fetch(`${getBackendBaseURL()}/api/v1/auth/setup-status`)
        .then((r) => r.json())
        .then((data: { needs_setup?: boolean }) => {
          if (cancelled) return;
          if (data.needs_setup) {
            setMode("init_admin");
          } else {
            // System already set up and user is not logged in — go to login
            router.push("/login");
          }
        })
        .catch(() => {
          if (!cancelled) router.push("/login");
        });
    } else {
      // Authenticated but needs_setup is false — already set up
      router.push("/workspace");
    }

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, router]);

  // ── Init-admin handler ─────────────────────────────────────────────
  const handleInitAdmin = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${getBackendBaseURL()}/api/v1/auth/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDesktopAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          email,
          password: newPassword,
        }),
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

      await refreshUser();
      router.refresh();
      router.push("/workspace");
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setLoading(false);
    }
  };

  // ── Change-password handler ────────────────────────────────────────
  const handleChangePassword = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }
    if (newPassword.length < 8) {
      setError("密码长度不能少于8位");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${getBackendBaseURL()}/api/v1/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
          ...getDesktopAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          new_email: email || undefined,
        }),
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

      await refreshUser();
      router.refresh();
      router.push("/workspace");
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "loading") {
    return (
      <div className="bg-ql-bg flex min-h-screen items-center justify-center">
        <p className="text-sm text-ql-ink-mid">加载中…</p>
      </div>
    );
  }

  // ── Admin initialization form ──────────────────────────────────────
  if (mode === "init_admin") {
    return (
      <AuthShell title="初始化管理员" subtitle="请设置管理员账户以开始使用。">
        <form onSubmit={handleInitAdmin} className="space-y-2">
          <div className="flex flex-col space-y-1">
            <label htmlFor="email" className={authLabelClass}>
              邮箱
            </label>
            <Input
              id="email"
              type="email"
              placeholder="请输入邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              placeholder="密码（至少8位）"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className={authFieldClass}
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label htmlFor="confirmPassword" className={authLabelClass}>
              确认密码
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className={authFieldClass}
            />
          </div>
          {error && <p className={cn("ms-1 text-sm", authErrorClass)}>{error}</p>}
          <Button type="submit" className={authSubmitClass} disabled={loading}>
            {loading ? "正在创建账户…" : "创建管理员账户"}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // ── Change-password form (needs_setup after login) ─────────────────
  return (
    <AuthShell title="完成管理员账户设置" subtitle="请设置您的真实邮箱和新密码。">
      <form onSubmit={handleChangePassword} className="space-y-4">
        <Input
          type="email"
          placeholder="您的邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={authFieldClass}
        />
        <Input
          type="password"
          placeholder="当前密码"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className={authFieldClass}
        />
        <Input
          type="password"
          placeholder="新密码"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className={authFieldClass}
        />
        <Input
          type="password"
          placeholder="确认新密码"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          className={authFieldClass}
        />
        {error && <p className={cn("text-sm", authErrorClass)}>{error}</p>}
        <Button type="submit" className={authSubmitClass} disabled={loading}>
          {loading ? "正在设置…" : "完成设置"}
        </Button>
      </form>
    </AuthShell>
  );
}

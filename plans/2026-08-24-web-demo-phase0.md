# QiLin Web Demo — Phase 0 Implementation Plan

> **Goal:** 一个真实可运行的生产级 Web Demo,直连 `app/gateway`,覆盖 Chat / Threads / Runs / Skills 四大核心子系统,作为 QiLin v2.0.0 多智能体引擎的用户面演示。
>
> **Architecture:** Next.js 14 App Router 单仓子目录 `web-demo/`,Server Components 直连 gateway REST,浏览器 EventSource 直连 SSE;TanStack Query 客户端缓存,Zustand 局部状态;TypeScript strict 全开。
>
> **Tech Stack:** Next.js 14.2 / React 18 / TypeScript 5 strict / Tailwind CSS 3 / shadcn/ui (Radix) / TanStack Query 5 / TanStack Table 8 / Zustand 4 / react-flow 11 / react-markdown / sonner / lucide-react / Framer Motion / Vitest / pnpm
>
> **依赖前置:** Phase 0 启动前需要 QiLin `app/gateway` 已用 `uvicorn app.gateway.app:app --port 8080` 启动并通过健康检查。
>
> **执行方式:** 单 agent 内联执行(用户偏好,subagent-driven 暂不需要),按 Task 顺序推进,每 Task 完成后 git commit。

---

## 文件结构总览

**新增:**(全部在 `web-demo/` 下,与 QiLin 主仓解耦)

```
web-demo/
├── package.json
├── pnpm-lock.yaml
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── components.json
├── postcss.config.mjs
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── .env.example
├── .env.local                   (本地,不提交)
├── README.md
├── vitest.config.ts
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                 (首页/总览)
│   ├── error.tsx
│   ├── loading.tsx
│   ├── not-found.tsx
│   ├── api/health/route.ts
│   ├── login/page.tsx
│   ├── (workspace)/
│   │   ├── layout.tsx           (workspace 子布局:含 sidebar)
│   │   ├── chat/
│   │   │   ├── page.tsx         (新建 thread 后跳转)
│   │   │   └── [thread_id]/page.tsx
│   │   ├── threads/page.tsx
│   │   └── runs/page.tsx
│   └── (market)/
│       ├── layout.tsx
│       └── skills/page.tsx
├── components/
│   ├── ui/                      (shadcn 组件封装,12+ 个)
│   ├── layout/
│   │   ├── app-shell.tsx
│   │   ├── sidebar.tsx
│   │   ├── topbar.tsx
│   │   ├── theme-toggle.tsx
│   │   └── nav-config.ts
│   ├── chat/
│   │   ├── chat-view.tsx
│   │   ├── thread-list-panel.tsx
│   │   ├── message-list.tsx
│   │   ├── message-item.tsx
│   │   ├── tool-call-card.tsx
│   │   ├── subagent-card.tsx
│   │   ├── orchestrator-graph-modal.tsx
│   │   ├── token-usage-bar.tsx
│   │   └── composer.tsx
│   ├── threads/
│   │   ├── threads-table.tsx
│   │   └── thread-detail-drawer.tsx
│   ├── runs/
│   │   ├── runs-table.tsx
│   │   └── run-detail-drawer.tsx
│   ├── skills/
│   │   ├── skill-grid.tsx
│   │   ├── skill-card.tsx
│   │   ├── skill-detail-drawer.tsx
│   │   ├── skill-upload-dialog.tsx
│   │   └── skill-scan-progress.tsx
│   ├── home/
│   │   ├── overview-stats.tsx
│   │   └── activity-feed.tsx
│   └── shared/
│       ├── data-table.tsx
│       ├── connection-banner.tsx
│       ├── empty-state.tsx
│       ├── error-state.tsx
│       └── gateway-health-gate.tsx
├── lib/
│   ├── api/
│   │   ├── client.ts            (gateway fetch 封装)
│   │   ├── auth.ts              (登录 / 登出 / 当前用户)
│   │   ├── threads.ts
│   │   ├── runs.ts
│   │   ├── skills.ts
│   │   ├── agents.ts            (agent 列表)
│   │   ├── models.ts
│   │   ├── uploads.ts
│   │   ├── memory.ts
│   │   ├── mcp.ts
│   │   └── types.ts             (统一 ApiError/ApiResult 类型)
│   ├── sse/
│   │   ├── use-event-source.ts  (带指数退避的 EventSource hook)
│   │   └── stream-types.ts      (RunEvent / ToolCall / SubagentEvent)
│   ├── auth/
│   │   └── session.ts           (cookie / token 读取)
│   ├── types/
│   │   ├── thread.ts
│   │   ├── run.ts
│   │   ├── skill.ts
│   │   ├── agent.ts
│   │   ├── model.ts
│   │   ├── upload.ts
│   │   └── common.ts
│   ├── gateway/
│   │   ├── health.ts            (启动期 health check)
│   │   └── config.ts            (环境变量 + base URL)
│   ├── stores/
│   │   ├── chat-store.ts        (Zustand:当前 thread / 消息缓冲)
│   │   └── ui-store.ts          (sidebar collapsed / theme)
│   └── utils.ts                 (cn / formatDate / formatNumber)
├── hooks/
│   ├── use-gateway-status.ts
│   ├── use-sse-run.ts           (订阅 run 流式事件)
│   └── use-debounce.ts
├── styles/
│   └── globals.css              (Tailwind base + shadcn vars + qilin accent)
└── tests/
    ├── lib/api/client.test.ts
    ├── lib/sse/use-event-source.test.ts
    ├── components/chat/message-item.test.tsx
    ├── components/skills/skill-card.test.tsx
    └── components/shared/data-table.test.tsx
```

---

## 任务分解(28 个 Task)

> 粒度说明:每个 Task 是 1 个组件或 1 个功能单元,内部用 3-7 个 step 实现。所有 step 都给出精确路径与命令。

---

### Task 0: 脚手架与目录初始化

**Files:**
- Create: `web-demo/`(整个目录)
- Create: `web-demo/.gitignore`
- Create: `web-demo/README.md`
- Create: `web-demo/.env.example`

- [ ] **Step 1:** 创建 `web-demo/` 目录
```bash
mkdir -p web-demo
cd web-demo
```

- [ ] **Step 2:** 创建 `web-demo/.gitignore`
```gitignore
node_modules
.next
out
.env.local
.env.*.local
*.log
.DS_Store
dist
coverage
.pnpm-store
```

- [ ] **Step 3:** 创建 `web-demo/.env.example`
```bash
GATEWAY_BASE_URL=http://127.0.0.1:8080
GATEWAY_AUTH_TOKEN=
NEXT_PUBLIC_APP_NAME=QiLin Demo
```

- [ ] **Step 4:** 创建 `web-demo/README.md`(Phase 0 完成时填充完整内容;此处仅占位)
```markdown
# QiLin Web Demo

> Phase 0 · MVP

参见 docs/superpowers/specs/2026-08-24-web-demo-design.md
```

- [ ] **Step 5:** 在 QiLin 主仓的 `.gitignore` 追加 web-demo 构建产物(避免主仓被污染)
编辑 `/Users/libing/kk_Projects/QiLin/.gitignore`,确保 `web-demo/node_modules` / `web-demo/.next` 已被忽略(主仓已有 `node_modules` 通配)。

- [ ] **Step 6:** 提交
```bash
cd /Users/libing/kk_Projects/QiLin
git add web-demo/.gitignore web-demo/README.md web-demo/.env.example
git commit -m "chore(web-demo): scaffold directory + env example"
```

---

### Task 1: package.json + pnpm 初始化

**Files:**
- Create: `web-demo/package.json`
- Create: `web-demo/tsconfig.json`
- Create: `web-demo/next.config.mjs`
- Create: `web-demo/postcss.config.mjs`
- Create: `web-demo/components.json`
- Create: `web-demo/tailwind.config.ts`

- [ ] **Step 1:** 创建 `web-demo/package.json`
```json
{
  "name": "qilin-web-demo",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier --write ."
  },
  "dependencies": {
    "next": "14.2.18",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "@tanstack/react-query": "^5.59.0",
    "@tanstack/react-table": "^8.20.5",
    "zustand": "^4.5.5",
    "reactflow": "^11.11.4",
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0",
    "rehype-highlight": "^7.0.0",
    "sonner": "^1.5.0",
    "lucide-react": "^0.456.0",
    "framer-motion": "^11.11.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.4",
    "class-variance-authority": "^0.7.0",
    "date-fns": "^4.1.0",
    "react-dropzone": "^14.2.10",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.2",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-popover": "^1.1.2",
    "@radix-ui/react-progress": "^1.1.0",
    "@radix-ui/react-scroll-area": "^1.2.0",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.2",
    "@radix-ui/react-tooltip": "^1.1.4",
    "@radix-ui/react-visually-hidden": "^1.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.16.10",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.6.3",
    "tailwindcss": "^3.4.13",
    "tailwindcss-animate": "^1.0.7",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "eslint": "^8.57.1",
    "eslint-config-next": "14.2.18",
    "prettier": "^3.3.3",
    "prettier-plugin-tailwindcss": "^0.6.8",
    "vitest": "^2.1.2",
    "@vitejs/plugin-react": "^4.3.2",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0",
    "jsdom": "^25.0.1"
  }
}
```

- [ ] **Step 2:** 创建 `web-demo/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 3:** 创建 `web-demo/next.config.mjs`
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['reactflow'],
  experimental: {
    serverActions: { bodySizeLimit: '10mb' }
  }
};
export default nextConfig;
```

- [ ] **Step 4:** 创建 `web-demo/postcss.config.mjs`
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 5:** 创建 `web-demo/tailwind.config.ts`
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1440px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        // QiLin 主题强调色
        qilin: {
          DEFAULT: '#10b981',
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'pulse-dot': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.4' } }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};
export default config;
```

- [ ] **Step 6:** 创建 `web-demo/components.json`(shadcn 配置)
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "tailwind.config.ts", "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils" }
}
```

- [ ] **Step 7:** 安装依赖(预计 2-3 分钟)
```bash
cd web-demo
pnpm install 2>&1 | tail -20
```

- [ ] **Step 8:** 验证安装
```bash
ls node_modules/.bin/next node_modules/.bin/tsc 2>&1 | head
```
期望:`node_modules/.bin/next` 与 `node_modules/.bin/tsc` 都存在。

- [ ] **Step 9:** 提交
```bash
git add web-demo/package.json web-demo/tsconfig.json web-demo/next.config.mjs web-demo/postcss.config.mjs web-demo/tailwind.config.ts web-demo/components.json web-demo/pnpm-lock.yaml
git commit -m "chore(web-demo): package.json + tsconfig + next + tailwind + shadcn config"
```

---

### Task 2: ESLint + Prettier + Vitest 配置

**Files:**
- Create: `web-demo/.eslintrc.json`
- Create: `web-demo/.prettierrc`
- Create: `web-demo/vitest.config.ts`
- Create: `web-demo/lib/utils.ts`

- [ ] **Step 1:** 创建 `web-demo/.eslintrc.json`
```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }]
  }
}
```

- [ ] **Step 2:** 创建 `web-demo/.prettierrc`
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 3:** 创建 `web-demo/vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}']
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') }
  }
});
```

- [ ] **Step 4:** 创建 `web-demo/lib/utils.ts`
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: Date | string | number): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDateTime(date: Date | string | number): string {
  return format(new Date(date), 'yyyy-MM-dd HH:mm:ss');
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
```

- [ ] **Step 5:** 创建 `web-demo/tests/setup.ts`
```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6:** 验证 lint
```bash
cd web-demo
pnpm lint 2>&1 | tail -10
```
期望:无 error(可能有 warning 提示无文件)

- [ ] **Step 7:** 提交
```bash
git add web-demo/.eslintrc.json web-demo/.prettierrc web-demo/vitest.config.ts web-demo/lib/utils.ts web-demo/tests/setup.ts
git commit -m "chore(web-demo): eslint + prettier + vitest config"
```

---

### Task 3: 全局样式与 shadcn 组件封装

**Files:**
- Create: `web-demo/app/globals.css`
- Create: `web-demo/components/ui/{button,card,input,textarea,label,scroll-area,separator,dropdown-menu,dialog,drawer,badge,progress,switch,tabs,tooltip,sonner,select}.tsx`(共 17 个,按需)

- [ ] **Step 1:** 创建 `web-demo/app/globals.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 160 84% 39%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 160 84% 39%;
    --radius: 0.625rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 4.5%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 4.5%;
    --popover-foreground: 0 0% 98%;
    --primary: 160 70% 50%;
    --primary-foreground: 240 10% 3.9%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 50%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 160 70% 50%;
  }

  * { @apply border-border; }
  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: 'rlig' 1, 'calt' 1;
  }
}

@layer utilities {
  .scrollbar-thin { scrollbar-width: thin; scrollbar-color: hsl(var(--muted)) transparent; }
  .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
  .scrollbar-thin::-webkit-scrollbar-thumb { background-color: hsl(var(--muted)); border-radius: 3px; }
}
```

- [ ] **Step 2:** 批量创建 shadcn 基础组件 — 为节省篇幅,以下是代表性模板,其余按 shadcn 标准实现。

`web-demo/components/ui/button.tsx`:
```typescript
'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';
export { buttonVariants };
```

`web-demo/components/ui/card.tsx`:
```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)} {...props} />
  )
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';
```

`web-demo/components/ui/input.tsx`:
```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';
```

`web-demo/components/ui/textarea.tsx`:
```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
```

`web-demo/components/ui/badge.tsx`:
```typescript
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-qilin-500/15 text-qilin-400',
        warning: 'border-transparent bg-amber-500/15 text-amber-400'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

`web-demo/components/ui/sonner.tsx`(toast):
```typescript
'use client';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground'
        }
      }}
    />
  );
}
```

- [ ] **Step 3:** 为其余组件(dialog / drawer / dropdown-menu / label / progress / scroll-area / select / separator / switch / tabs / tooltip)创建 shadcn 标准实现。

> 由于这些组件每个都是 shadcn 标准实现,代码量较大,**实际编写时从 https://ui.shadcn.com/docs/components 对应组件页直接复制并适配 import path** 即可。所有组件路径统一在 `web-demo/components/ui/`。

- [ ] **Step 4:** 提交
```bash
git add web-demo/app/globals.css web-demo/components/ui/
git commit -m "feat(web-demo): global styles + shadcn component library"
```

---

### Task 4: 类型定义层(gateway DTO)

**Files:**
- Create: `web-demo/lib/types/common.ts`
- Create: `web-demo/lib/types/thread.ts`
- Create: `web-demo/lib/types/run.ts`
- Create: `web-demo/lib/types/skill.ts`
- Create: `web-demo/lib/types/agent.ts`
- Create: `web-demo/lib/types/model.ts`
- Create: `web-demo/lib/types/upload.ts`
- Create: `web-demo/lib/types/index.ts`

- [ ] **Step 1:** 创建 `web-demo/lib/types/common.ts`
```typescript
export type ID = string;
export type ISODateString = string;
export type Result<T, E = ApiError> = { ok: true; data: T } | { ok: false; error: E };

export interface ApiError {
  message: string;
  code: string;
  request_id?: string;
  status: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
```

- [ ] **Step 2:** 创建 `web-demo/lib/types/thread.ts`
```typescript
import type { ID, ISODateString } from './common';

export interface Thread {
  thread_id: ID;
  title?: string;
  created_at: ISODateString;
  updated_at: ISODateString;
  metadata?: Record<string, unknown>;
}

export interface ThreadMessage {
  id: ID;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  created_at: ISODateString;
}

export interface ToolCall {
  id: ID;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration_ms?: number;
}
```

- [ ] **Step 3:** 创建 `web-demo/lib/types/run.ts`
```typescript
import type { ID, ISODateString } from './common';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Run {
  run_id: ID;
  thread_id: ID;
  agent_name: string;
  status: RunStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
  started_at?: ISODateString;
  completed_at?: ISODateString;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

// SSE 流式事件类型
export type StreamEvent =
  | { type: 'message.start'; run_id: string; thread_id: string }
  | { type: 'message.chunk'; run_id: string; delta: string }
  | { type: 'message.complete'; run_id: string; content: string }
  | { type: 'tool.call'; run_id: string; tool_call: ToolCallInfo }
  | { type: 'tool.result'; run_id: string; tool_call_id: string; result: string; duration_ms: number }
  | { type: 'subagent.start'; run_id: string; subagent_id: string; subagent_name: string }
  | { type: 'subagent.event'; run_id: string; subagent_id: string; event: string }
  | { type: 'subagent.complete'; run_id: string; subagent_id: string; success: boolean; result?: string; error?: string }
  | { type: 'token.usage'; run_id: string; input_tokens: number; output_tokens: number; total_tokens: number }
  | { type: 'error'; run_id: string; message: string }
  | { type: 'done'; run_id: string };

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
```

- [ ] **Step 4:** 创建 `web-demo/lib/types/skill.ts`
```typescript
import type { ID, ISODateString } from './common';

export type SkillSource = 'builtin' | 'marketplace' | 'user' | 'community';
export type SkillScanStatus = 'pending' | 'scanning' | 'passed' | 'rejected' | 'warning';

export interface Skill {
  name: string;
  description: string;
  source: SkillSource;
  enabled: boolean;
  installed_at?: ISODateString;
  scan_status?: SkillScanStatus;
  scan_result?: SkillScanResult;
  version?: string;
  author?: string;
  tags?: string[];
}

export interface SkillScanResult {
  status: SkillScanStatus;
  findings: SkillFinding[];
  scanned_at: ISODateString;
}

export interface SkillFinding {
  severity: 'info' | 'warning' | 'error';
  message: string;
  location?: string;
}
```

- [ ] **Step 5:** 创建 `web-demo/lib/types/agent.ts`、`model.ts`、`upload.ts`、`index.ts`

`web-demo/lib/types/agent.ts`:
```typescript
import type { ID } from './common';
export interface Agent {
  name: ID;
  description?: string;
  model: string;
  system_prompt?: string;
  tools?: string[];
  skills?: string[];
  metadata?: Record<string, unknown>;
}
```

`web-demo/lib/types/model.ts`:
```typescript
export interface ModelInfo {
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
  max_tokens?: number;
}
```

`web-demo/lib/types/upload.ts`:
```typescript
import type { ID, ISODateString } from './common';
export interface Upload {
  id: ID;
  filename: string;
  virtual_path: string;
  size: number;
  mime_type: string;
  uploaded_at: ISODateString;
}
```

`web-demo/lib/types/index.ts`:
```typescript
export * from './common';
export * from './thread';
export * from './run';
export * from './skill';
export * from './agent';
export * from './model';
export * from './upload';
```

- [ ] **Step 6:** 验证类型检查通过
```bash
cd web-demo && pnpm typecheck 2>&1 | tail -10
```
期望:无 error

- [ ] **Step 7:** 提交
```bash
git add web-demo/lib/types/
git commit -m "feat(web-demo): shared type definitions (DTO mirroring gateway)"
```

---

### Task 5: Gateway 配置与健康检查

**Files:**
- Create: `web-demo/lib/gateway/config.ts`
- Create: `web-demo/lib/gateway/health.ts`
- Create: `web-demo/app/api/health/route.ts`
- Create: `web-demo/components/shared/gateway-health-gate.tsx`
- Create: `web-demo/tests/lib/gateway/health.test.ts`

- [ ] **Step 1:** 创建 `web-demo/lib/gateway/config.ts`
```typescript
export const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:8080';
export const GATEWAY_AUTH_TOKEN = process.env.GATEWAY_AUTH_TOKEN ?? '';
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'QiLin Demo';

export const API_TIMEOUT_MS = 30000;
```

- [ ] **Step 2:** 创建 `web-demo/lib/gateway/health.ts`
```typescript
import { GATEWAY_BASE_URL } from './config';

export interface HealthStatus {
  ok: boolean;
  status: string;
  version?: string;
  latency_ms: number;
  error?: string;
}

export async function checkGatewayHealth(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store'
    });
    const latency_ms = Date.now() - start;
    if (!res.ok) {
      return { ok: false, status: 'unhealthy', latency_ms, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { status?: string; version?: string };
    return { ok: true, status: data.status ?? 'healthy', version: data.version, latency_ms };
  } catch (err) {
    const latency_ms = Date.now() - start;
    return { ok: false, status: 'unreachable', latency_ms, error: (err as Error).message };
  }
}
```

- [ ] **Step 3:** 创建 `web-demo/app/api/health/route.ts`(web-demo 自己的健康检查,供部署平台用)
```typescript
import { NextResponse } from 'next/server';
import { checkGatewayHealth } from '@/lib/gateway/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await checkGatewayHealth();
  return NextResponse.json(
    { web_demo: 'ok', gateway: status },
    { status: status.ok ? 200 : 503 }
  );
}
```

- [ ] **Step 4:** 创建 `web-demo/components/shared/gateway-health-gate.tsx`
```typescript
import { checkGatewayHealth } from '@/lib/gateway/health';

export async function GatewayHealthGate({ children }: { children: React.ReactNode }) {
  const status = await checkGatewayHealth();
  if (!status.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <div className="mb-3 text-3xl">⚠️</div>
          <h1 className="mb-2 text-xl font-semibold">QiLin Gateway 未就绪</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Web Demo 需要连接到 QiLin Gateway 才能运行。当前健康检查失败:
          </p>
          <pre className="rounded-md bg-muted p-3 text-left text-xs">
{JSON.stringify(status, null, 2)}
          </pre>
          <p className="mt-4 text-xs text-muted-foreground">
            请在 QiLin 仓库根目录运行: <code className="rounded bg-muted px-1">uvicorn app.gateway.app:app --port 8080</code>
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 5:** 写健康检查测试 `web-demo/tests/lib/gateway/health.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('checkGatewayHealth', () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = vi.fn();
  });

  it('returns ok when gateway responds 200', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy', version: '2.0.0' })
    });
    const { checkGatewayHealth } = await import('@/lib/gateway/health');
    const result = await checkGatewayHealth();
    expect(result.ok).toBe(true);
    expect(result.version).toBe('2.0.0');
  });

  it('returns error when fetch throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { checkGatewayHealth } = await import('@/lib/gateway/health');
    const result = await checkGatewayHealth();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
```

- [ ] **Step 6:** 运行测试
```bash
cd web-demo && pnpm test 2>&1 | tail -15
```
期望:2 个测试通过

- [ ] **Step 7:** 提交
```bash
git add web-demo/lib/gateway/ web-demo/app/api/health/ web-demo/components/shared/gateway-health-gate.tsx web-demo/tests/lib/gateway/
git commit -m "feat(web-demo): gateway config + health check + startup gate"
```

---

### Task 6: API 客户端封装

**Files:**
- Create: `web-demo/lib/api/types.ts`
- Create: `web-demo/lib/api/client.ts`
- Create: `web-demo/lib/api/auth.ts`
- Create: `web-demo/lib/api/agents.ts`
- Create: `web-demo/lib/api/models.ts`
- Create: `web-demo/lib/api/threads.ts`
- Create: `web-demo/lib/api/runs.ts`
- Create: `web-demo/lib/api/skills.ts`
- Create: `web-demo/lib/api/uploads.ts`
- Create: `web-demo/lib/api/memory.ts`
- Create: `web-demo/lib/api/mcp.ts`
- Create: `web-demo/lib/api/index.ts`
- Create: `web-demo/tests/lib/api/client.test.ts`

- [ ] **Step 1:** 创建 `web-demo/lib/api/types.ts`
```typescript
import type { ApiError } from '@/lib/types';

export type { ApiError, Result } from '@/lib/types';
export class GatewayError extends Error {
  constructor(public readonly apiError: ApiError) {
    super(apiError.message);
    this.name = 'GatewayError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}
```

- [ ] **Step 2:** 创建 `web-demo/lib/api/client.ts`(核心 fetch wrapper)
```typescript
import { GATEWAY_BASE_URL, API_TIMEOUT_MS } from '@/lib/gateway/config';
import { GatewayError, type ApiError, type RequestOptions } from './types';

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${GATEWAY_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function gatewayFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, query, signal } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());

  try {
    const res = await fetch(buildUrl(path, query), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'include',
      cache: 'no-store'
    });

    if (!res.ok) {
      let apiError: ApiError;
      try {
        const data = await res.json();
        apiError = {
          message: data.message ?? data.detail ?? `HTTP ${res.status}`,
          code: data.code ?? `HTTP_${res.status}`,
          request_id: data.request_id,
          status: res.status
        };
      } catch {
        apiError = { message: `HTTP ${res.status}`, code: `HTTP_${res.status}`, status: res.status };
      }
      throw new GatewayError(apiError);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function gatewayFetchRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'include'
  });
}
```

- [ ] **Step 3:** 创建各领域 API 模块(以 auth/threads/skills 为例,其余结构相同)

`web-demo/lib/api/auth.ts`:
```typescript
import { gatewayFetch } from './client';

export interface LoginInput { username: string; password: string; }
export interface SessionUser { id: string; username: string; email?: string; role: string; is_internal?: boolean; }

export const authApi = {
  login: (input: LoginInput) => gatewayFetch<SessionUser>('/api/auth/login', { method: 'POST', body: input }),
  logout: () => gatewayFetch<void>('/api/auth/logout', { method: 'POST' }),
  me: () => gatewayFetch<SessionUser>('/api/auth/me'),
  register: (input: LoginInput & { email?: string }) =>
    gatewayFetch<SessionUser>('/api/auth/register', { method: 'POST', body: input })
};
```

`web-demo/lib/api/threads.ts`:
```typescript
import { gatewayFetch } from './client';
import type { Thread, ThreadMessage, Paginated } from '@/lib/types';

export const threadsApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Thread>>('/api/threads', { query: params }),
  get: (thread_id: string) => gatewayFetch<Thread>(`/api/threads/${thread_id}`),
  messages: (thread_id: string, params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<ThreadMessage>>(`/api/threads/${thread_id}/messages`, { query: params }),
  create: (input: { title?: string; metadata?: Record<string, unknown> }) =>
    gatewayFetch<Thread>('/api/threads', { method: 'POST', body: input }),
  delete: (thread_id: string) => gatewayFetch<void>(`/api/threads/${thread_id}`, { method: 'DELETE' }),
  update: (thread_id: string, input: { title?: string; metadata?: Record<string, unknown> }) =>
    gatewayFetch<Thread>(`/api/threads/${thread_id}`, { method: 'PATCH', body: input })
};
```

`web-demo/lib/api/runs.ts`:
```typescript
import { gatewayFetch } from './client';
import type { Run, Paginated } from '@/lib/types';

export interface CreateRunInput {
  thread_id: string;
  input: string;
  agent_name?: string;
  metadata?: Record<string, unknown>;
}

export const runsApi = {
  list: (params?: { thread_id?: string; page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Run>>('/api/runs', { query: params }),
  get: (run_id: string) => gatewayFetch<Run>(`/api/runs/${run_id}`),
  create: (input: CreateRunInput) =>
    gatewayFetch<Run>('/api/runs', { method: 'POST', body: input }),
  cancel: (run_id: string) => gatewayFetch<Run>(`/api/runs/${run_id}/cancel`, { method: 'POST' }),
  delete: (run_id: string) => gatewayFetch<void>(`/api/runs/${run_id}`, { method: 'DELETE' })
};
```

`web-demo/lib/api/skills.ts`:
```typescript
import { gatewayFetch } from './client';
import type { Skill, SkillScanResult, Paginated } from '@/lib/types';

export const skillsApi = {
  list: (params?: { source?: string; enabled?: boolean; page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Skill>>('/api/skills', { query: params }),
  get: (name: string) => gatewayFetch<Skill>(`/api/skills/${name}`),
  install: (formData: FormData) =>
    fetch(`${process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:8080'}/api/skills/install`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as Skill;
    }),
  setEnabled: (name: string, enabled: boolean) =>
    gatewayFetch<Skill>(`/api/skills/${name}`, { method: 'PATCH', body: { enabled } }),
  delete: (name: string) => gatewayFetch<void>(`/api/skills/${name}`, { method: 'DELETE' }),
  rescan: (name: string) => gatewayFetch<SkillScanResult>(`/api/skills/${name}/rescan`, { method: 'POST' })
};
```

`web-demo/lib/api/agents.ts`:
```typescript
import { gatewayFetch } from './client';
import type { Agent } from '@/lib/types';

export const agentsApi = {
  list: () => gatewayFetch<Agent[]>('/api/agents'),
  get: (name: string) => gatewayFetch<Agent>(`/api/agents/${name}`),
  create: (input: Omit<Agent, 'metadata'> & { metadata?: Record<string, unknown> }) =>
    gatewayFetch<Agent>('/api/agents', { method: 'POST', body: input }),
  update: (name: string, input: Partial<Agent>) =>
    gatewayFetch<Agent>(`/api/agents/${name}`, { method: 'PATCH', body: input }),
  delete: (name: string) => gatewayFetch<void>(`/api/agents/${name}`, { method: 'DELETE' })
};
```

`web-demo/lib/api/models.ts`:
```typescript
import { gatewayFetch } from './client';
import type { ModelInfo } from '@/lib/types';

export const modelsApi = {
  list: () => gatewayFetch<ModelInfo[]>('/api/models'),
  get: (name: string) => gatewayFetch<ModelInfo>(`/api/models/${name}`)
};
```

`web-demo/lib/api/uploads.ts`:
```typescript
import { gatewayFetch } from './client';
import type { Upload, Paginated } from '@/lib/types';

export const uploadsApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Upload>>('/api/uploads', { query: params }),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${process.env.GATEWAY_BASE_URL ?? 'http://127.0.0.1:8080'}/api/uploads`, {
      method: 'POST', body: fd, credentials: 'include'
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as Upload;
    });
  },
  delete: (id: string) => gatewayFetch<void>(`/api/uploads/${id}`, { method: 'DELETE' })
};
```

`web-demo/lib/api/memory.ts`:
```typescript
import { gatewayFetch } from './client';
import type { Paginated } from '@/lib/types';

export interface MemoryFact {
  id: string;
  content: string;
  category: string;
  confidence: number;
  created_at: string;
}

export const memoryApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<MemoryFact>>('/api/memory/facts', { query: params }),
  search: (q: string) => gatewayFetch<MemoryFact[]>(`/api/memory/search?q=${encodeURIComponent(q)}`),
  create: (input: { content: string; category?: string; confidence?: number }) =>
    gatewayFetch<MemoryFact>('/api/memory/facts', { method: 'POST', body: input }),
  delete: (id: string) => gatewayFetch<void>(`/api/memory/facts/${id}`, { method: 'DELETE' }),
  reload: () => gatewayFetch<{ reloaded: number }>('/api/memory/reload', { method: 'POST' }),
  clear: () => gatewayFetch<void>('/api/memory/clear', { method: 'POST' })
};
```

`web-demo/lib/api/mcp.ts`:
```typescript
import { gatewayFetch } from './client';

export interface McpServer {
  name: string;
  url: string;
  enabled: boolean;
  tools_count: number;
  status: 'connected' | 'disconnected' | 'error';
}

export const mcpApi = {
  list: () => gatewayFetch<McpServer[]>('/api/mcp/servers'),
  get: (name: string) => gatewayFetch<McpServer>(`/api/mcp/servers/${name}`),
  add: (input: { name: string; url: string; auth?: Record<string, string> }) =>
    gatewayFetch<McpServer>('/api/mcp/servers', { method: 'POST', body: input }),
  remove: (name: string) => gatewayFetch<void>(`/api/mcp/servers/${name}`, { method: 'DELETE' }),
  setEnabled: (name: string, enabled: boolean) =>
    gatewayFetch<McpServer>(`/api/mcp/servers/${name}`, { method: 'PATCH', body: { enabled } }),
  refresh: (name: string) => gatewayFetch<McpServer>(`/api/mcp/servers/${name}/refresh`, { method: 'POST' })
};
```

`web-demo/lib/api/index.ts`:
```typescript
export * from './client';
export * from './types';
export { authApi } from './auth';
export { agentsApi } from './agents';
export { modelsApi } from './models';
export { threadsApi } from './threads';
export { runsApi } from './runs';
export { skillsApi } from './skills';
export { uploadsApi } from './uploads';
export { memoryApi } from './memory';
export { mcpApi } from './mcp';
```

- [ ] **Step 4:** 写 client 测试 `web-demo/tests/lib/api/client.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('gatewayFetch', () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = vi.fn();
  });

  it('builds URL with query params', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ items: [] })
    });
    const { gatewayFetch } = await import('@/lib/api/client');
    await gatewayFetch('/api/x', { query: { page: 2, page_size: 10 } });
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('page_size=10');
  });

  it('throws GatewayError on non-2xx', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 404, json: async () => ({ detail: 'not found' })
    });
    const { gatewayFetch } = await import('@/lib/api/client');
    const { GatewayError } = await import('@/lib/api/types');
    await expect(gatewayFetch('/api/x')).rejects.toBeInstanceOf(GatewayError);
  });

  it('returns undefined on 204', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 204, json: async () => null
    });
    const { gatewayFetch } = await import('@/lib/api/client');
    const result = await gatewayFetch('/api/x');
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 5:** 运行测试
```bash
cd web-demo && pnpm test 2>&1 | tail -15
```
期望:5 个测试通过(2 health + 3 client)

- [ ] **Step 6:** 提交
```bash
git add web-demo/lib/api/ web-demo/tests/lib/api/
git commit -m "feat(web-demo): gateway REST client + domain API modules"
```

---

### Task 7: SSE 流式 hook(useEventSource)

**Files:**
- Create: `web-demo/lib/sse/use-event-source.ts`
- Create: `web-demo/lib/sse/stream-types.ts`
- Create: `web-demo/tests/lib/sse/use-event-source.test.ts`

- [ ] **Step 1:** 创建 `web-demo/lib/sse/stream-types.ts`
```typescript
import type { StreamEvent } from '@/lib/types';
export type { StreamEvent };
export type StreamHandler = (event: StreamEvent) => void;
export type StreamStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
```

- [ ] **Step 2:** 创建 `web-demo/lib/sse/use-event-source.ts`
```typescript
'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { StreamEvent, StreamHandler, StreamStatus } from './stream-types';

interface UseEventSourceOptions {
  url: string | null;
  onEvent: StreamHandler;
  onError?: (err: Event) => void;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export function useEventSource({
  url,
  onEvent,
  onError,
  maxRetries = Infinity,
  baseDelayMs = 1000,
  maxDelayMs = 30000
}: UseEventSourceOptions) {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const retryRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  onEventRef.current = onEvent;
  onErrorRef.current = onError;

  const connect = useCallback(() => {
    if (!url) return;
    setStatus('connecting');
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      retryRef.current = 0;
      setStatus('open');
    };

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as StreamEvent;
        onEventRef.current(event);
      } catch {
        // ignore non-JSON heartbeats
      }
    };

    es.onerror = (e) => {
      setStatus('error');
      es.close();
      onErrorRef.current?.(e);
      if (retryRef.current < maxRetries) {
        const delay = Math.min(baseDelayMs * 2 ** retryRef.current, maxDelayMs);
        retryRef.current += 1;
        setTimeout(() => connect(), delay);
      } else {
        setStatus('closed');
      }
    };
  }, [url, maxRetries, baseDelayMs, maxDelayMs]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      setStatus('closed');
    };
  }, [connect]);

  return { status };
}
```

- [ ] **Step 3:** 写测试 `web-demo/tests/lib/sse/use-event-source.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean | undefined;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials;
    MockEventSource.instances.push(this);
  }
  close() { this.closed = true; }
  fireMessage(data: string) { this.onmessage?.({ data }); }
  fireOpen() { this.onopen?.(); }
  fireError() { this.onerror?.(new Event('error')); }
}

beforeEach(() => {
  MockEventSource.instances = [];
  (global as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
});

describe('useEventSource', () => {
  it('connects and parses messages', async () => {
    const onEvent = vi.fn();
    renderHook(() => useEventSource({ url: '/api/stream', onEvent }));
    await act(async () => {
      MockEventSource.instances[0].fireOpen();
      MockEventSource.instances[0].fireMessage(JSON.stringify({ type: 'message.chunk', run_id: 'r', delta: 'hi' }));
    });
    expect(onEvent).toHaveBeenCalledWith({ type: 'message.chunk', run_id: 'r', delta: 'hi' });
  });

  it('ignores non-JSON data', async () => {
    const onEvent = vi.fn();
    renderHook(() => useEventSource({ url: '/api/stream', onEvent }));
    await act(async () => {
      MockEventSource.instances[0].fireOpen();
      MockEventSource.instances[0].fireMessage('heartbeat');
    });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4:** 运行测试
```bash
cd web-demo && pnpm test 2>&1 | tail -15
```
期望:7 个测试通过

- [ ] **Step 5:** 提交
```bash
git add web-demo/lib/sse/ web-demo/tests/lib/sse/
git commit -m "feat(web-demo): SSE hook with exponential backoff + tests"
```

---

### Task 8: 根布局与主题系统

**Files:**
- Create: `web-demo/app/providers.tsx`
- Create: `web-demo/components/layout/theme-toggle.tsx`
- Create: `web-demo/app/layout.tsx`(最终版)

- [ ] **Step 1:** 创建 `web-demo/app/providers.tsx`
```typescript
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 }
        }
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2:** 创建 `web-demo/components/layout/theme-toggle.tsx`
```typescript
'use client';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem('theme')) as 'dark' | 'light' | null;
    const initial = stored ?? 'dark';
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="切换主题">
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
```

- [ ] **Step 3:** 创建 `web-demo/app/layout.tsx`
```typescript
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import { GatewayHealthGate } from '@/components/shared/gateway-health-gate';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'QiLin Demo',
  description: 'Production-grade Web demo for QiLin multi-agent engine'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <Providers>
          <GatewayHealthGate>{children}</GatewayHealthGate>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4:** 验证启动(需要 gateway 在跑,否则会显示健康检查失败页)
```bash
cd web-demo && pnpm dev &
sleep 8
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```
期望:`http_code=200`(即使 gateway 没起,health gate 也是 200 渲染错误页)

- [ ] **Step 5:** 提交
```bash
git add web-demo/app/layout.tsx web-demo/app/providers.tsx web-demo/components/layout/theme-toggle.tsx
git commit -m "feat(web-demo): root layout + theme + providers + gateway gate"
```

---

### Task 9: 布局组件(Sidebar + Topbar + AppShell)

**Files:**
- Create: `web-demo/components/layout/nav-config.ts`
- Create: `web-demo/components/layout/sidebar.tsx`
- Create: `web-demo/components/layout/topbar.tsx`
- Create: `web-demo/components/layout/app-shell.tsx`

- [ ] **Step 1:** 创建 `web-demo/components/layout/nav-config.ts`
```typescript
import { Home, MessageSquare, ListTree, Activity, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: 'P0' | 'P1' | 'P2' | 'P3';
  disabled?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { title: '总览', href: '/', icon: Home },
  { title: '对话', href: '/chat', icon: MessageSquare, badge: 'P0' },
  { title: '线程', href: '/threads', icon: ListTree, badge: 'P0' },
  { title: '运行', href: '/runs', icon: Activity, badge: 'P0' },
  { title: '技能市场', href: '/skills', icon: Sparkles, badge: 'P0' }
];

export const FUTURE_NAV_ITEMS: NavItem[] = [
  { title: '工具', href: '/tools', icon: Sparkles, badge: 'P1', disabled: true },
  { title: 'MCP', href: '/mcp', icon: Sparkles, badge: 'P1', disabled: true },
  { title: '记忆', href: '/memory', icon: Sparkles, badge: 'P1', disabled: true },
  { title: '上传', href: '/uploads', icon: Sparkles, badge: 'P1', disabled: true },
  { title: '渠道', href: '/channels', icon: Sparkles, badge: 'P2', disabled: true },
  { title: '调度', href: '/scheduler', icon: Sparkles, badge: 'P2', disabled: true },
  { title: '模型', href: '/models', icon: Sparkles, badge: 'P2', disabled: true },
  { title: '配置', href: '/config', icon: Sparkles, badge: 'P2', disabled: true },
  { title: '授权', href: '/authz', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '护栏', href: '/guardrails', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '沙箱', href: '/sandbox', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '追踪', href: '/tracing', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '持久化', href: '/persistence', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '反射', href: '/reflection', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '工作区变更', href: '/workspace-changes', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '社区', href: '/community', icon: Sparkles, badge: 'P3', disabled: true },
  { title: '集成', href: '/integrations', icon: Sparkles, badge: 'P3', disabled: true }
];
```

- [ ] **Step 2:** 创建 `web-demo/components/layout/sidebar.tsx`
```typescript
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, FUTURE_NAV_ITEMS } from './nav-config';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

export function Sidebar() {
  const pathname = usePathname();
  const renderItem = (item: typeof NAV_ITEMS[number]) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={item.disabled ? '#' : item.href}
        aria-disabled={item.disabled}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          isActive && 'bg-accent text-accent-foreground font-medium',
          !isActive && !item.disabled && 'hover:bg-accent/50 text-muted-foreground hover:text-foreground',
          item.disabled && 'pointer-events-none opacity-40'
        )}
      >
        <item.icon className="h-4 w-4" />
        <span className="flex-1">{item.title}</span>
        {item.badge && (
          <Badge variant={item.badge === 'P0' ? 'success' : 'outline'} className="text-[10px]">
            {item.badge}
          </Badge>
        )}
      </Link>
    );
  };

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card/30 md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="h-7 w-7 rounded-md bg-qilin-500" />
        <div>
          <div className="text-sm font-semibold leading-tight">QiLin</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent Engine</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        <div className="space-y-1">{NAV_ITEMS.map(renderItem)}</div>
        <Separator className="my-3" />
        <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          即将推出
        </div>
        <div className="space-y-1">{FUTURE_NAV_ITEMS.map(renderItem)}</div>
      </nav>
      <div className="border-t p-3 text-[10px] text-muted-foreground">
        v2.0.0 · Phase 0 MVP
      </div>
    </aside>
  );
}
```

- [ ] **Step 3:** 创建 `web-demo/components/layout/topbar.tsx`
```typescript
import { ThemeToggle } from './theme-toggle';
import { Badge } from '@/components/ui/badge';
import { APP_NAME } from '@/lib/gateway/config';

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">{APP_NAME}</h1>
        <Badge variant="success" className="text-[10px]">dev</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground md:inline">Gateway: localhost:8080</span>
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 4:** 创建 `web-demo/components/layout/app-shell.tsx`
```typescript
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import type { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="container py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5:** 提交
```bash
git add web-demo/components/layout/
git commit -m "feat(web-demo): sidebar + topbar + app shell with P0-P3 nav"
```

---

### Task 10: 首页 / 总览仪表盘

**Files:**
- Create: `web-demo/app/page.tsx`
- Create: `web-demo/components/home/overview-stats.tsx`
- Create: `web-demo/components/home/activity-feed.tsx`
- Create: `web-demo/components/shared/empty-state.tsx`

- [ ] **Step 1:** 创建 `web-demo/components/shared/empty-state.tsx`
```typescript
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-muted-foreground/60" />}
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {description && <p className="mb-4 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <Button size="sm" onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
```

- [ ] **Step 2:** 创建 `web-demo/components/home/overview-stats.tsx`
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Activity, Sparkles, Layers } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface Stat { label: string; value: number | string; icon: typeof MessageSquare; trend?: string; }

export function OverviewStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            <s.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {typeof s.value === 'number' ? formatNumber(s.value) : s.value}
            </div>
            {s.trend && <p className="mt-1 text-xs text-muted-foreground">{s.trend}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export const DEFAULT_STATS: Stat[] = [
  { label: '线程总数', value: 0, icon: MessageSquare, trend: '—' },
  { label: '今日运行', value: 0, icon: Activity, trend: '—' },
  { label: '已启用技能', value: 0, icon: Sparkles, trend: '—' },
  { label: '可用模型', value: 0, icon: Layers, trend: '—' }
];
```

- [ ] **Step 3:** 创建 `web-demo/components/home/activity-feed.tsx`
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { MessageSquare } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export interface ActivityItem {
  id: string;
  type: 'thread' | 'run' | 'skill';
  title: string;
  timestamp: string;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">最近活动</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState icon={MessageSquare} title="暂无活动" description="开始对话后,这里会显示最近的线程与运行" />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-qilin-500" />
                <div className="flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.type} · {formatRelativeTime(item.timestamp)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4:** 创建 `web-demo/app/page.tsx`
```typescript
import { AppShell } from '@/components/layout/app-shell';
import { OverviewStats, DEFAULT_STATS } from '@/components/home/overview-stats';
import { ActivityFeed } from '@/components/home/activity-feed';
import { threadsApi, runsApi, skillsApi, modelsApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [threads, runs, skills, models] = await Promise.allSettled([
    threadsApi.list({ page: 1, page_size: 1 }),
    runsApi.list({ page: 1, page_size: 1 }),
    skillsApi.list({ page: 1, page_size: 100 }),
    modelsApi.list()
  ]);

  const stats = [
    { ...DEFAULT_STATS[0], value: threads.status === 'fulfilled' ? threads.value.total : '—' },
    { ...DEFAULT_STATS[1], value: runs.status === 'fulfilled' ? runs.value.total : '—' },
    {
      ...DEFAULT_STATS[2],
      value: skills.status === 'fulfilled' ? skills.value.items.filter((s) => s.enabled).length : '—'
    },
    { ...DEFAULT_STATS[3], value: models.status === 'fulfilled' ? models.value.length : '—' }
  ];

  const recentThreads = threads.status === 'fulfilled' ? threads.value.items.slice(0, 5).map((t) => ({
    id: t.thread_id, type: 'thread' as const, title: t.title ?? t.thread_id, timestamp: t.updated_at
  })) : [];

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">总览</h1>
        <p className="mt-1 text-sm text-muted-foreground">QiLin 引擎实时运行状态</p>
      </div>
      <div className="space-y-6">
        <OverviewStats stats={stats} />
        <ActivityFeed items={recentThreads} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5:** 启动 dev 验证
```bash
cd web-demo && pnpm dev &
sleep 8
curl -sS http://127.0.0.1:3000/ | head -c 200
kill %1 2>/dev/null
```

- [ ] **Step 6:** 提交
```bash
git add web-demo/app/page.tsx web-demo/components/home/ web-demo/components/shared/empty-state.tsx
git commit -m "feat(web-demo): home overview dashboard with stats + activity feed"
```

---

### Task 11: Workspace 子布局 + Threads 页骨架

**Files:**
- Create: `web-demo/app/(workspace)/layout.tsx`
- Create: `web-demo/app/(workspace)/threads/page.tsx`
- Create: `web-demo/components/threads/threads-table.tsx`
- Create: `web-demo/components/shared/data-table.tsx`

- [ ] **Step 1:** 创建 `web-demo/components/shared/data-table.tsx`(通用表格封装)
```typescript
'use client';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState
} from '@tanstack/react-table';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  searchPlaceholder?: string;
  emptyMessage?: ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ data, columns, searchPlaceholder = '搜索…', emptyMessage, onRowClick }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const table = useReactTable({
    data, columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } }
  });

  return (
    <div className="space-y-3">
      <Input
        placeholder={searchPlaceholder}
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {emptyMessage ?? '暂无数据'}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={onRowClick ? 'cursor-pointer' : ''}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {table.getFilteredRowModel().rows.length} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            上一页
          </Button>
          <span>第 {table.getState().pagination.pageIndex + 1} / {table.getPageCount()} 页</span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** 创建 `web-demo/components/ui/table.tsx`(shadcn 表格基础组件)
```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  )
);
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />
  )
);
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0', className)} {...props} />
  )
);
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('p-2 align-middle [&:has([role=checkbox])]:pr-0', className)} {...props} />
  )
);
TableCell.displayName = 'TableCell';
```

- [ ] **Step 3:** 创建 `web-demo/components/threads/threads-table.tsx`
```typescript
'use client';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, truncate } from '@/lib/utils';
import type { Thread } from '@/lib/types';

const columns: ColumnDef<Thread, unknown>[] = [
  {
    accessorKey: 'thread_id',
    header: 'Thread ID',
    cell: ({ row }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{truncate(row.original.thread_id, 20)}</code>
  },
  { accessorKey: 'title', header: '标题', cell: ({ row }) => row.original.title ?? '—' },
  { accessorKey: 'updated_at', header: '最后活动', cell: ({ row }) => formatRelativeTime(row.original.updated_at) },
  {
    accessorKey: 'metadata',
    header: '元数据',
    cell: ({ row }) => {
      const keys = Object.keys(row.original.metadata ?? {});
      return keys.length > 0 ? <Badge variant="outline">{keys.length}</Badge> : '—';
    }
  }
];

export function ThreadsTable({ data, onSelect }: { data: Thread[]; onSelect?: (t: Thread) => void }) {
  return <DataTable data={data} columns={columns} searchPlaceholder="搜索 thread_id / 标题…" onRowClick={onSelect} />;
}
```

- [ ] **Step 4:** 创建 `web-demo/app/(workspace)/layout.tsx`
```typescript
import { AppShell } from '@/components/layout/app-shell';
import type { ReactNode } from 'react';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 5:** 创建 `web-demo/app/(workspace)/threads/page.tsx`
```typescript
import { threadsApi } from '@/lib/api';
import { ThreadsTableClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ThreadsPage() {
  const result = await threadsApi.list({ page: 1, page_size: 100 }).catch(() => ({ items: [], total: 0 }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">线程</h1>
        <p className="mt-1 text-sm text-muted-foreground">所有会话线程(共 {result.total} 条)</p>
      </div>
      <ThreadsTableClient initial={result.items} />
    </div>
  );
}
```

- [ ] **Step 6:** 创建 `web-demo/app/(workspace)/threads/client.tsx`(客户端组件)
```typescript
'use client';
import { useState } from 'react';
import { ThreadsTable } from '@/components/threads/threads-table';
import { ThreadDetailDrawer } from '@/components/threads/thread-detail-drawer';
import { EmptyState } from '@/components/shared/empty-state';
import type { Thread } from '@/lib/types';
import { MessageSquare } from 'lucide-react';

export function ThreadsTableClient({ initial }: { initial: Thread[] }) {
  const [selected, setSelected] = useState<Thread | null>(null);
  return (
    <>
      {initial.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="还没有线程"
          description="前往「对话」页面创建第一个对话"
        />
      ) : (
        <ThreadsTable data={initial} onSelect={setSelected} />
      )}
      <ThreadDetailDrawer thread={selected} onClose={() => setSelected(null)} />
    </>
  );
}
```

- [ ] **Step 7:** 提交
```bash
git add web-demo/app/\(workspace\)/ web-demo/components/threads/ web-demo/components/shared/data-table.tsx web-demo/components/ui/table.tsx
git commit -m "feat(web-demo): workspace layout + threads list page + DataTable"
```

---

### Task 12: Thread Detail Drawer + Runs 页

**Files:**
- Create: `web-demo/components/threads/thread-detail-drawer.tsx`
- Create: `web-demo/app/(workspace)/runs/page.tsx`
- Create: `web-demo/components/runs/runs-table.tsx`
- Create: `web-demo/components/runs/run-detail-drawer.tsx`

- [ ] **Step 1:** 创建 `web-demo/components/ui/drawer.tsx`(基于 vaul 简化版,或使用 Dialog 替代;此处用 Dialog 简化)
> 由于 vaul 需要额外安装,Phase 0 先用 Dialog(右侧 modal)实现"Drawer"风格,后续可换 vaul。

`web-demo/components/ui/dialog.tsx`(基于 @radix-ui/react-dialog):
```typescript
'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)} {...props} />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed right-0 top-0 z-50 h-full w-full max-w-xl border-l bg-background p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none">
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-4 flex flex-col space-y-1.5 text-left', className)} {...props} />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
```

- [ ] **Step 2:** 创建 `web-demo/components/threads/thread-detail-drawer.tsx`
```typescript
'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';
import type { Thread } from '@/lib/types';
import { useEffect, useState } from 'react';
import { threadsApi } from '@/lib/api';
import type { ThreadMessage } from '@/lib/types';
import { Loader2 } from 'lucide-react';

export function ThreadDetailDrawer({ thread, onClose }: { thread: Thread | null; onClose: () => void }) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!thread) return;
    setLoading(true);
    threadsApi.messages(thread.thread_id, { page: 1, page_size: 50 })
      .then((r) => setMessages(r.items))
      .finally(() => setLoading(false));
  }, [thread]);

  return (
    <Dialog open={!!thread} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{thread?.title ?? thread?.thread_id}</DialogTitle>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{thread?.thread_id}</Badge>
            <span>{thread && formatRelativeTime(thread.updated_at)}</span>
          </div>
        </DialogHeader>
        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无消息</div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div key={m.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={m.role === 'user' ? 'default' : 'secondary'}>{m.role}</Badge>
                    <span className="text-muted-foreground">{formatDateTime(m.created_at)}</span>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3:** 创建 `web-demo/components/ui/scroll-area.tsx`(Radix 封装)
```typescript
'use client';
import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn('flex touch-none select-none transition-colors', orientation === 'vertical' ? 'h-full w-2.5 border-l border-l-transparent p-px' : 'h-2.5 flex-col border-t border-t-transparent p-px', className)}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;
```

- [ ] **Step 4:** 创建 `web-demo/components/runs/runs-table.tsx`
```typescript
'use client';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, truncate } from '@/lib/utils';
import type { Run, RunStatus } from '@/lib/types';

const STATUS_VARIANT: Record<RunStatus, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  pending: 'secondary',
  running: 'warning',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'secondary'
};

const columns: ColumnDef<Run, unknown>[] = [
  { accessorKey: 'run_id', header: 'Run ID', cell: ({ row }) => <code className="text-xs">{truncate(row.original.run_id, 16)}</code> },
  { accessorKey: 'agent_name', header: 'Agent' },
  { accessorKey: 'thread_id', header: 'Thread', cell: ({ row }) => truncate(row.original.thread_id, 12) },
  { accessorKey: 'status', header: '状态', cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge> },
  { accessorKey: 'total_tokens', header: 'Tokens', cell: ({ row }) => row.original.total_tokens ?? '—' },
  { accessorKey: 'updated_at', header: '更新时间', cell: ({ row }) => formatRelativeTime(row.original.updated_at) }
];

export function RunsTable({ data, onSelect }: { data: Run[]; onSelect?: (r: Run) => void }) {
  return <DataTable data={data} columns={columns} searchPlaceholder="搜索 run / agent…" onRowClick={onSelect} />;
}
```

- [ ] **Step 5:** 创建 `web-demo/components/runs/run-detail-drawer.tsx`
```typescript
'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import type { Run } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function RunDetailDrawer({ run, onClose }: { run: Run | null; onClose: () => void }) {
  return (
    <Dialog open={!!run} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run {run?.run_id.slice(0, 16)}</DialogTitle>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{run?.agent_name}</Badge>
            <span>{run && formatDateTime(run.created_at)}</span>
          </div>
        </DialogHeader>
        {run && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">状态</CardTitle></CardHeader>
              <CardContent><Badge>{run.status}</Badge></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Token 用量</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-sm">
                <div><div className="text-muted-foreground">Input</div><div>{run.input_tokens ?? '—'}</div></div>
                <div><div className="text-muted-foreground">Output</div><div>{run.output_tokens ?? '—'}</div></div>
                <div><div className="text-muted-foreground">Total</div><div>{run.total_tokens ?? '—'}</div></div>
              </CardContent>
            </Card>
            {run.error && (
              <Card>
                <CardHeader><CardTitle className="text-sm text-destructive">错误</CardTitle></CardHeader>
                <CardContent><pre className="text-xs">{run.error}</pre></CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6:** 创建 `web-demo/app/(workspace)/runs/page.tsx`
```typescript
import { runsApi } from '@/lib/api';
import { RunsClient } from './client';

export const dynamic = 'force-dynamic';

export default async function RunsPage() {
  const result = await runsApi.list({ page: 1, page_size: 100 }).catch(() => ({ items: [], total: 0 }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">运行</h1>
        <p className="mt-1 text-sm text-muted-foreground">所有 Agent 运行(共 {result.total} 条)</p>
      </div>
      <RunsClient initial={result.items} />
    </div>
  );
}
```

- [ ] **Step 7:** 创建 `web-demo/app/(workspace)/runs/client.tsx`
```typescript
'use client';
import { useState } from 'react';
import { RunsTable } from '@/components/runs/runs-table';
import { RunDetailDrawer } from '@/components/runs/run-detail-drawer';
import { EmptyState } from '@/components/shared/empty-state';
import type { Run } from '@/lib/types';
import { Activity } from 'lucide-react';

export function RunsClient({ initial }: { initial: Run[] }) {
  const [selected, setSelected] = useState<Run | null>(null);
  return (
    <>
      {initial.length === 0 ? (
        <EmptyState icon={Activity} title="还没有运行" description="开始对话后,这里会显示运行历史" />
      ) : (
        <RunsTable data={initial} onSelect={setSelected} />
      )}
      <RunDetailDrawer run={selected} onClose={() => setSelected(null)} />
    </>
  );
}
```

- [ ] **Step 8:** 提交
```bash
git add web-demo/components/threads/thread-detail-drawer.tsx web-demo/app/\(workspace\)/runs/ web-demo/components/runs/ web-demo/components/ui/dialog.tsx web-demo/components/ui/scroll-area.tsx
git commit -m "feat(web-demo): thread/run detail drawers + runs page"
```

---

### Task 13: Skills 子布局 + 列表/详情

**Files:**
- Create: `web-demo/app/(market)/layout.tsx`
- Create: `web-demo/app/(market)/skills/page.tsx`
- Create: `web-demo/components/skills/skill-grid.tsx`
- Create: `web-demo/components/skills/skill-card.tsx`
- Create: `web-demo/components/skills/skill-detail-drawer.tsx`

- [ ] **Step 1:** 创建 `web-demo/app/(market)/layout.tsx`
```typescript
import { AppShell } from '@/components/layout/app-shell';
import type { ReactNode } from 'react';
export default function MarketLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 2:** 创建 `web-demo/components/skills/skill-card.tsx`
```typescript
import type { Skill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { Sparkles, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

const SCAN_ICON = {
  passed: <ShieldCheck className="h-3.5 w-3.5 text-qilin-400" />,
  warning: <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />,
  rejected: <Shield className="h-3.5 w-3.5 text-destructive" />,
  scanning: <Shield className="h-3.5 w-3.5 animate-pulse text-muted-foreground" />,
  pending: <Shield className="h-3.5 w-3.5 text-muted-foreground" />
};

const SOURCE_VARIANT: Record<Skill['source'], 'default' | 'secondary' | 'outline' | 'success'> = {
  builtin: 'default', marketplace: 'secondary', user: 'outline', community: 'success'
};

interface SkillCardProps {
  skill: Skill;
  onSelect?: (s: Skill) => void;
  onToggle?: (s: Skill, enabled: boolean) => void;
}

export function SkillCard({ skill, onSelect, onToggle }: SkillCardProps) {
  return (
    <Card className="flex h-full flex-col transition-colors hover:border-primary/40">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-qilin-400" />
            {skill.name}
          </CardTitle>
          <Switch checked={skill.enabled} onCheckedChange={(c) => onToggle?.(skill, c)} aria-label="启用" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={SOURCE_VARIANT[skill.source]}>{skill.source}</Badge>
          {skill.scan_status && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {SCAN_ICON[skill.scan_status]}
              {skill.scan_status}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between">
        <p className="line-clamp-2 text-sm text-muted-foreground">{truncate(skill.description, 120)}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{skill.installed_at ? formatRelativeTime(skill.installed_at) : '未安装'}</span>
          <Button variant="ghost" size="sm" onClick={() => onSelect?.(skill)}>详情</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3:** 创建 `web-demo/components/ui/switch.tsx`
```typescript
'use client';
import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
```

- [ ] **Step 4:** 创建 `web-demo/components/skills/skill-grid.tsx`
```typescript
'use client';
import { useState } from 'react';
import { SkillCard } from './skill-card';
import { SkillDetailDrawer } from './skill-detail-drawer';
import { SkillUploadDialog } from './skill-upload-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { Sparkles, Upload } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { skillsApi } from '@/lib/api';
import { toast } from 'sonner';
import type { Skill } from '@/lib/types';

export function SkillGrid({ initial }: { initial: Skill[] }) {
  const [filter, setFilter] = useState('');
  const [source, setSource] = useState<string>('all');
  const [selected, setSelected] = useState<Skill | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      skillsApi.setEnabled(name, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      toast.success('技能状态已更新');
    },
    onError: (e) => toast.error(`更新失败: ${(e as Error).message}`)
  });

  const filtered = initial.filter((s) => {
    if (filter && !s.name.includes(filter) && !s.description.includes(filter)) return false;
    if (source !== 'all' && s.source !== source) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="搜索技能名称或描述…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-40"><SelectValue placeholder="来源" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            <SelectItem value="builtin">builtin</SelectItem>
            <SelectItem value="marketplace">marketplace</SelectItem>
            <SelectItem value="user">user</SelectItem>
            <SelectItem value="community">community</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />上传技能
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={initial.length === 0 ? '技能市场为空' : '没有匹配的技能'}
          description={initial.length === 0 ? '点击"上传技能"安装第一个技能' : '调整搜索条件或来源过滤'}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <SkillCard
              key={s.name}
              skill={s}
              onSelect={setSelected}
              onToggle={(skill, enabled) => toggleMutation.mutate({ name: skill.name, enabled })}
            />
          ))}
        </div>
      )}

      <SkillDetailDrawer skill={selected} onClose={() => setSelected(null)} />
      <SkillUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
```

- [ ] **Step 5:** 创建 `web-demo/components/ui/select.tsx`
```typescript
'use client';
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild><ChevronDown className="h-4 w-4 opacity-50" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn('relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md', className)}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport className={cn('p-1', position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]')}>
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn('relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
```

- [ ] **Step 6:** 创建 `web-demo/components/skills/skill-detail-drawer.tsx`
```typescript
'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { skillsApi } from '@/lib/api';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/utils';
import type { Skill } from '@/lib/types';

export function SkillDetailDrawer({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const rescanMutation = useMutation({
    mutationFn: (name: string) => skillsApi.rescan(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      toast.success('重新扫描完成');
    },
    onError: (e) => toast.error(`扫描失败: ${(e as Error).message}`)
  });

  return (
    <Dialog open={!!skill} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{skill?.name}</DialogTitle>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{skill?.source}</Badge>
            {skill?.installed_at && <span>{formatDateTime(skill.installed_at)}</span>}
          </div>
        </DialogHeader>
        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          {skill && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">描述</CardTitle></CardHeader>
                <CardContent><p className="text-sm">{skill.description}</p></CardContent>
              </Card>
              {skill.tags && skill.tags.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">标签</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {skill.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                    </div>
                  </CardContent>
                </Card>
              )}
              {skill.scan_result && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">扫描结果</CardTitle>
                      <Button size="sm" variant="outline" onClick={() => rescanMutation.mutate(skill.name)} disabled={rescanMutation.isPending}>
                        {rescanMutation.isPending ? '扫描中…' : '重新扫描'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {skill.scan_result.findings.length === 0 ? (
                      <p className="text-xs text-muted-foreground">未发现问题</p>
                    ) : (
                      <ul className="space-y-2 text-xs">
                        {skill.scan_result.findings.map((f, i) => (
                          <li key={i} className={f.severity === 'error' ? 'text-destructive' : f.severity === 'warning' ? 'text-amber-400' : 'text-muted-foreground'}>
                            [{f.severity}] {f.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7:** 创建 `web-demo/app/(market)/skills/page.tsx`
```typescript
import { skillsApi } from '@/lib/api';
import { SkillGrid } from '@/components/skills/skill-grid';

export const dynamic = 'force-dynamic';

export default async function SkillsPage() {
  const result = await skillsApi.list({ page: 1, page_size: 100 }).catch(() => ({ items: [] as never[] }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">技能市场</h1>
        <p className="mt-1 text-sm text-muted-foreground">浏览、安装与启用 QiLin 技能({result.items.length} 个)</p>
      </div>
      <SkillGrid initial={result.items as never[]} />
    </div>
  );
}
```

- [ ] **Step 8:** 提交
```bash
git add web-demo/app/\(market\)/ web-demo/components/skills/ web-demo/components/ui/switch.tsx web-demo/components/ui/select.tsx
git commit -m "feat(web-demo): skills market grid + detail drawer + filter/toggle"
```

---

### Task 14: Skills 上传 Dialog

**Files:**
- Create: `web-demo/components/skills/skill-upload-dialog.tsx`
- Create: `web-demo/components/skills/skill-scan-progress.tsx`
- Create: `web-demo/components/ui/progress.tsx`

- [ ] **Step 1:** 创建 `web-demo/components/ui/progress.tsx`
```typescript
'use client';
import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;
```

- [ ] **Step 2:** 创建 `web-demo/components/skills/skill-scan-progress.tsx`
```typescript
'use client';
import { Progress } from '@/components/ui/progress';

export type ScanStage = 'uploading' | 'extracting' | 'static-scan' | 'llm-review' | 'installing' | 'done' | 'failed';

const STAGE_LABEL: Record<ScanStage, string> = {
  uploading: '上传中',
  extracting: '解压中',
  'static-scan': '静态扫描',
  'llm-review': 'LLM 复审',
  installing: '安装中',
  done: '完成',
  failed: '失败'
};

const STAGE_PROGRESS: Record<ScanStage, number> = {
  uploading: 15, extracting: 30, 'static-scan': 55, 'llm-review': 80, installing: 95, done: 100, failed: 100
};

export function SkillScanProgress({ stage, message }: { stage: ScanStage; message?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{STAGE_LABEL[stage]}</span>
        <span className="text-muted-foreground">{STAGE_PROGRESS[stage]}%</span>
      </div>
      <Progress value={STAGE_PROGRESS[stage]} className={stage === 'failed' ? '[&>div]:bg-destructive' : ''} />
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 3:** 创建 `web-demo/components/skills/skill-upload-dialog.tsx`
```typescript
'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SkillScanProgress, type ScanStage } from './skill-scan-progress';
import { skillsApi } from '@/lib/api';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, FileArchive } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

export function SkillUploadDialog({ open, onOpenChange }: Props) {
  const [stage, setStage] = useState<ScanStage>('uploading');
  const [message, setMessage] = useState<string | undefined>();
  const [file, setFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/zip': ['.zip'], 'application/x-tar': ['.tar', '.tar.gz'] },
    maxFiles: 1
  });

  const reset = () => { setStage('uploading'); setMessage(undefined); setFile(null); };

  const handleUpload = async () => {
    if (!file) return;
    try {
      const stages: ScanStage[] = ['uploading', 'extracting', 'static-scan', 'llm-review', 'installing', 'done'];
      for (const s of stages) {
        setStage(s);
        setMessage(`${s}...`);
        await new Promise((r) => setTimeout(r, 400));
      }
      const fd = new FormData();
      fd.append('file', file);
      await skillsApi.install(fd);
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      toast.success(`技能 ${file.name} 安装成功`);
      reset();
      onOpenChange(false);
    } catch (e) {
      setStage('failed');
      setMessage((e as Error).message);
      toast.error(`安装失败: ${(e as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>上传技能</DialogTitle>
          <DialogDescription>上传 .zip / .tar.gz 技能包,系统会自动进行静态扫描与 LLM 复审</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragActive ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileArchive className="h-10 w-10 text-qilin-400" />
                <div className="text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div className="text-sm">拖拽文件到此处,或点击选择</div>
                <div className="text-xs text-muted-foreground">支持 .zip / .tar.gz</div>
              </div>
            )}
          </div>
          {file && <SkillScanProgress stage={stage} message={message} />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>取消</Button>
            <Button onClick={handleUpload} disabled={!file || stage === 'uploading' || stage === 'done' || stage === 'failed'}>
              {stage === 'failed' ? '重试' : '开始安装'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4:** 提交
```bash
git add web-demo/components/skills/skill-upload-dialog.tsx web-demo/components/skills/skill-scan-progress.tsx web-demo/components/ui/progress.tsx
git commit -m "feat(web-demo): skill upload dialog with scan progress + dropzone"
```

---

### Task 15: Chat 子布局 + Chat 入口页

**Files:**
- Create: `web-demo/app/(workspace)/chat/page.tsx`
- Create: `web-demo/app/(workspace)/chat/[thread_id]/page.tsx`
- Create: `web-demo/components/chat/chat-view.tsx`
- Create: `web-demo/components/chat/thread-list-panel.tsx`

- [ ] **Step 1:** 创建 `web-demo/app/(workspace)/chat/page.tsx`(新建 thread 后跳转)
```typescript
import { threadsApi } from '@/lib/api';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NewChatPage() {
  const thread = await threadsApi.create({ title: '新对话' });
  redirect(`/chat/${thread.thread_id}`);
}
```

- [ ] **Step 2:** 创建 `web-demo/app/(workspace)/chat/[thread_id]/page.tsx`
```typescript
import { ChatView } from '@/components/chat/chat-view';
import { threadsApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }: { params: { thread_id: string } }) {
  const thread = await threadsApi.get(params.thread_id).catch(() => null);
  return <ChatView threadId={params.thread_id} initialTitle={thread?.title} />;
}
```

- [ ] **Step 3:** 创建 `web-demo/components/chat/thread-list-panel.tsx`
```typescript
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { threadsApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Loader2, Trash2, MessageSquare } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';

export function ThreadListPanel() {
  const router = useRouter();
  const params = useParams<{ thread_id?: string }>();
  const queryClient = useQueryClient();
  const activeId = params.thread_id;

  const { data: threads = [], isLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: () => threadsApi.list({ page: 1, page_size: 50 }).then((r) => r.items)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => threadsApi.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      toast.success('线程已删除');
      if (id === activeId) router.push('/chat');
    }
  });

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r bg-card/30">
      <div className="border-b p-3">
        <Button className="w-full" onClick={() => router.push('/chat')}>
          <Plus className="mr-2 h-4 w-4" />新对话
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : threads.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">还没有对话</div>
        ) : (
          <div className="space-y-1 p-2">
            {threads.map((t) => (
              <div
                key={t.thread_id}
                onClick={() => router.push(`/chat/${t.thread_id}`)}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent/50',
                  t.thread_id === activeId && 'bg-accent text-accent-foreground'
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{t.title ?? t.thread_id.slice(0, 16)}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{formatRelativeTime(t.updated_at)}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm('删除此线程?')) deleteMutation.mutate(t.thread_id); }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="删除"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 4:** 创建 `web-demo/components/chat/chat-view.tsx`(主 chat 容器)
```typescript
'use client';
import { useState } from 'react';
import { ThreadListPanel } from './thread-list-panel';
import { MessageList } from './message-list';
import { Composer } from './composer';
import { useQuery } from '@tanstack/react-query';
import { threadsApi, agentsApi, modelsApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Network } from 'lucide-react';
import { OrchestratorGraphModal } from './orchestrator-graph-modal';

export function ChatView({ threadId, initialTitle }: { threadId: string; initialTitle?: string }) {
  const [graphOpen, setGraphOpen] = useState(false);

  const { data: thread } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => threadsApi.get(threadId)
  });

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list() });
  const { data: models = [] } = useQuery({ queryKey: ['models'], queryFn: () => modelsApi.list() });

  const defaultAgent = agents[0];
  const defaultModel = models[0];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-6">
      <ThreadListPanel />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b bg-background/50 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{thread?.title ?? initialTitle ?? threadId.slice(0, 16)}</span>
            <Badge variant="outline" className="text-[10px]">{defaultAgent?.name ?? 'agent'}</Badge>
            <Badge variant="outline" className="text-[10px]">{defaultModel?.model ?? '—'}</Badge>
            <Badge variant="success" className="text-[10px]">single</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => setGraphOpen(true)}>
            <Network className="mr-2 h-4 w-4" />编排可视化
          </Button>
        </div>
        <MessageList threadId={threadId} />
        <Composer threadId={threadId} />
      </div>
      <OrchestratorGraphModal open={graphOpen} onOpenChange={setGraphOpen} threadId={threadId} />
    </div>
  );
}
```

- [ ] **Step 5:** 提交
```bash
git add web-demo/app/\(workspace\)/chat/ web-demo/components/chat/chat-view.tsx web-demo/components/chat/thread-list-panel.tsx
git commit -m "feat(web-demo): chat route + thread list panel + chat view shell"
```

---

### Task 16: Chat Message 渲染 + Tool/Subagent 卡片

**Files:**
- Create: `web-demo/components/chat/message-list.tsx`
- Create: `web-demo/components/chat/message-item.tsx`
- Create: `web-demo/components/chat/tool-call-card.tsx`
- Create: `web-demo/components/chat/subagent-card.tsx`
- Create: `web-demo/components/chat/token-usage-bar.tsx`

- [ ] **Step 1:** 创建 `web-demo/components/chat/token-usage-bar.tsx`
```typescript
'use client';
import { Progress } from '@/components/ui/progress';

export function TokenUsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
      <span className="shrink-0">Token</span>
      <Progress value={pct} className="h-1.5 max-w-xs" />
      <span className="shrink-0">{used.toLocaleString()} / {total.toLocaleString()}</span>
    </div>
  );
}
```

- [ ] **Step 2:** 创建 `web-demo/components/chat/tool-call-card.tsx`
```typescript
'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolCallInfo } from '@/lib/types';

interface Props {
  toolCall: ToolCallInfo & { result?: string; status: 'pending' | 'running' | 'completed' | 'failed'; duration_ms?: number };
}

const STATUS_ICON = {
  pending: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-qilin-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />
};

export function ToolCallCard({ toolCall }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border bg-muted/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/30"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3.5 w-3.5 text-qilin-400" />
        <span className="font-mono text-xs">{toolCall.name}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs">
          {STATUS_ICON[toolCall.status]}
          {toolCall.duration_ms !== undefined && (
            <span className="text-muted-foreground">{toolCall.duration_ms}ms</span>
          )}
        </span>
      </button>
      {open && (
        <div className="border-t p-3 space-y-2 text-xs">
          <div>
            <div className="mb-1 text-muted-foreground">参数</div>
            <pre className="rounded bg-background p-2 overflow-x-auto">{JSON.stringify(toolCall.args, null, 2)}</pre>
          </div>
          {toolCall.result !== undefined && (
            <div>
              <div className="mb-1 text-muted-foreground">结果</div>
              <pre className={cn('rounded bg-background p-2 overflow-x-auto max-h-60', toolCall.status === 'failed' && 'text-destructive')}>
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3:** 创建 `web-demo/components/chat/subagent-card.tsx`
```typescript
'use client';
import { Bot, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface SubagentInfo {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  steps?: number;
  current_step?: string;
  result?: string;
  error?: string;
}

export function SubagentCard({ subagent }: { subagent: SubagentInfo }) {
  const Icon = subagent.status === 'running' ? Loader2 : subagent.status === 'completed' ? CheckCircle2 : XCircle;
  const color =
    subagent.status === 'running' ? 'text-amber-400' : subagent.status === 'completed' ? 'text-qilin-400' : 'text-destructive';

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <Bot className="h-4 w-4 text-purple-400" />
        <span className="font-medium">SubAgent: {subagent.name}</span>
        <Icon className={`ml-auto h-4 w-4 ${color} ${subagent.status === 'running' ? 'animate-spin' : ''}`} />
      </div>
      {subagent.status === 'running' && (
        <div className="space-y-1">
          {subagent.current_step && <div className="text-xs text-muted-foreground">{subagent.current_step}</div>}
          <Progress value={subagent.steps ? Math.min(100, (subagent.steps / 50) * 100) : 30} className="h-1" />
        </div>
      )}
      {subagent.status === 'completed' && subagent.result && (
        <pre className="mt-1 max-h-32 overflow-y-auto rounded bg-background p-2 text-xs">{subagent.result}</pre>
      )}
      {subagent.status === 'failed' && subagent.error && (
        <pre className="mt-1 rounded bg-destructive/10 p-2 text-xs text-destructive">{subagent.error}</pre>
      )}
    </div>
  );
}
```

- [ ] **Step 4:** 创建 `web-demo/components/chat/message-item.tsx`
```typescript
'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ToolCallCard } from './tool-call-card';
import { SubagentCard } from './subagent-card';
import { cn } from '@/lib/utils';
import 'highlight.js/styles/github-dark.css';
import type { ThreadMessage } from '@/lib/types';

export interface DisplayMessage extends ThreadMessage {
  tool_calls_display?: Array<{
    id: string; name: string; args: Record<string, unknown>;
    result?: string; status: 'pending' | 'running' | 'completed' | 'failed'; duration_ms?: number;
  }>;
  subagents?: Array<{
    id: string; name: string; status: 'running' | 'completed' | 'failed'; steps?: number;
    current_step?: string; result?: string; error?: string;
  }>;
}

export function MessageItem({ message, isStreaming }: { message: DisplayMessage; isStreaming?: boolean }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-[85%] flex-col gap-2', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/50 border',
            isStreaming && 'animate-pulse'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {message.content || (isStreaming ? '● 思考中…' : '')}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {message.tool_calls_display && message.tool_calls_display.length > 0 && (
          <div className="w-full space-y-2">
            {message.tool_calls_display.map((tc) => <ToolCallCard key={tc.id} toolCall={tc} />)}
          </div>
        )}
        {message.subagents && message.subagents.length > 0 && (
          <div className="w-full space-y-2">
            {message.subagents.map((sa) => <SubagentCard key={sa.id} subagent={sa} />)}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5:** 创建 `web-demo/components/chat/message-list.tsx`
```typescript
'use client';
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageItem, type DisplayMessage } from './message-item';
import { threadsApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { useChatStream } from './use-chat-stream';
import { TokenUsageBar } from './token-usage-bar';
import { ScrollArea } from '@/components/ui/scroll-area';

export function MessageList({ threadId }: { threadId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, tokenUsage, isStreaming, send } = useChatStream(threadId);

  const { data: history, isLoading } = useQuery({
    queryKey: ['thread-messages', threadId],
    queryFn: () => threadsApi.messages(threadId, { page: 1, page_size: 50 }).then((r) => r.items)
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const displayMessages: DisplayMessage[] = [
    ...(history ?? []),
    ...messages
  ];

  return (
    <>
      <ScrollArea className="flex-1 px-4">
        <div className="mx-auto max-w-3xl space-y-6 py-6">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : displayMessages.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              开始对话吧 — 发送消息以触发 Agent
            </div>
          ) : (
            displayMessages.map((m) => <MessageItem key={m.id} message={m} isStreaming={isStreaming && m === messages[messages.length - 1]} />)
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      <TokenUsageBar used={tokenUsage.total_tokens} total={8000} />
      <input type="hidden" value={send as unknown as string} readOnly />
    </>
  );
}
```

- [ ] **Step 6:** 提交
```bash
git add web-demo/components/chat/message-list.tsx web-demo/components/chat/message-item.tsx web-demo/components/chat/tool-call-card.tsx web-demo/components/chat/subagent-card.tsx web-demo/components/chat/token-usage-bar.tsx
git commit -m "feat(web-demo): message list with tool/subagent cards + token usage bar"
```

---

### Task 17: Chat 流式 Hook + Composer + Orchestrator 可视化

**Files:**
- Create: `web-demo/components/chat/use-chat-stream.ts`
- Create: `web-demo/components/chat/composer.tsx`
- Create: `web-demo/components/chat/orchestrator-graph-modal.tsx`

- [ ] **Step 1:** 创建 `web-demo/components/chat/use-chat-stream.ts`(核心流式 hook)
```typescript
'use client';
import { useCallback, useRef, useState } from 'react';
import { useEventSource } from '@/lib/sse/use-event-source';
import { runsApi } from '@/lib/api';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';
import type { DisplayMessage } from './message-item';

interface StreamState {
  messages: DisplayMessage[];
  tokenUsage: { input_tokens: number; output_tokens: number; total_tokens: number };
  isStreaming: boolean;
  currentRunId: string | null;
  send: (text: string) => Promise<void>;
}

export function useChatStream(threadId: string): StreamState {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [tokenUsage, setTokenUsage] = useState({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const bufferRef = useRef('');

  useEventSource({
    url: currentRunId ? `${GATEWAY_BASE_URL}/api/runs/${currentRunId}/stream` : null,
    onEvent: (event) => {
      switch (event.type) {
        case 'message.chunk':
          bufferRef.current += event.delta;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant' && last.id === 'streaming') {
              next[next.length - 1] = { ...last, content: bufferRef.current };
            } else {
              next.push({ id: 'streaming', role: 'assistant', content: bufferRef.current, created_at: new Date().toISOString() });
            }
            return next;
          });
          break;
        case 'message.complete':
          bufferRef.current = '';
          setIsStreaming(false);
          break;
        case 'tool.call':
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            const tc = { id: event.tool_call.id, name: event.tool_call.name, args: event.tool_call.args, status: 'running' as const };
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, tool_calls_display: [...(last.tool_calls_display ?? []), tc] };
            } else {
              next.push({ id: 'tool-stream', role: 'assistant', content: '', created_at: new Date().toISOString(), tool_calls_display: [tc] });
            }
            return next;
          });
          break;
        case 'tool.result':
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              const m = next[i];
              if (m.tool_calls_display) {
                const tc = m.tool_calls_display.find((t) => t.id === event.tool_call_id);
                if (tc) {
                  m.tool_calls_display = m.tool_calls_display.map((t) =>
                    t.id === event.tool_call_id ? { ...t, result: event.result, duration_ms: event.duration_ms, status: 'completed' as const } : t
                  );
                  break;
                }
              }
            }
            return next;
          });
          break;
        case 'subagent.start':
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            const sa = { id: event.subagent_id, name: event.subagent_name, status: 'running' as const };
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, subagents: [...(last.subagents ?? []), sa] };
            } else {
              next.push({ id: 'sa-stream', role: 'assistant', content: '', created_at: new Date().toISOString(), subagents: [sa] });
            }
            return next;
          });
          break;
        case 'subagent.complete':
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              const m = next[i];
              if (m.subagents) {
                const sa = m.subagents.find((s) => s.id === event.subagent_id);
                if (sa) {
                  m.subagents = m.subagents.map((s) =>
                    s.id === event.subagent_id
                      ? { ...s, status: event.success ? 'completed' : 'failed', result: event.result, error: event.error }
                      : s
                  );
                  break;
                }
              }
            }
            return next;
          });
          break;
        case 'token.usage':
          setTokenUsage({ input_tokens: event.input_tokens, output_tokens: event.output_tokens, total_tokens: event.total_tokens });
          break;
        case 'error':
          setIsStreaming(false);
          console.error('Stream error:', event.message);
          break;
        case 'done':
          setIsStreaming(false);
          setCurrentRunId(null);
          break;
      }
    }
  });

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      bufferRef.current = '';
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString() }]);
      setIsStreaming(true);
      try {
        const run = await runsApi.create({ thread_id: threadId, input: text });
        setCurrentRunId(run.run_id);
      } catch (e) {
        setIsStreaming(false);
        console.error('Failed to create run:', e);
      }
    },
    [threadId, isStreaming]
  );

  return { messages, tokenUsage, isStreaming, currentRunId, send };
}
```

- [ ] **Step 2:** 创建 `web-demo/components/chat/composer.tsx`
```typescript
'use client';
import { useState, useRef, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Paperclip, Loader2 } from 'lucide-react';

export function Composer({ threadId, onSend }: { threadId: string; onSend: (text: string) => void | Promise<void> }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await onSend(t);
      setText('');
      textareaRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t bg-background/50 p-4 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-lg border bg-card p-2">
          <Button variant="ghost" size="icon" aria-label="附件"><Paperclip className="h-4 w-4" /></Button>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder="发送消息…(⌘/Ctrl + Enter)"
            className="min-h-[40px] resize-none border-0 focus-visible:ring-0"
            rows={1}
            data-thread={threadId}
          />
          <Button onClick={submit} disabled={!text.trim() || sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** 修改 `web-demo/components/chat/message-list.tsx` 让 Composer 接 send

把:
```typescript
import { useChatStream } from './use-chat-stream';
...
return (
  <>
    <ScrollArea ...>
      ...
    </ScrollArea>
    <TokenUsageBar .../>
    <input type="hidden" value={send as unknown as string} readOnly />
  </>
);
```
改为:
```typescript
import { Composer } from './composer';
...
return (
  <>
    <ScrollArea ...>
      ...
    </ScrollArea>
    <TokenUsageBar .../>
    <Composer threadId={threadId} onSend={send} />
  </>
);
```

- [ ] **Step 4:** 创建 `web-demo/components/chat/orchestrator-graph-modal.tsx`
```typescript
'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactFlow, { Background, Controls, type Node, type Edge } from 'reactflow';
import 'reactflow/dist/style.css';

const nodes: Node[] = [
  { id: 'orchestrator', type: 'input', position: { x: 250, y: 50 }, data: { label: '🎯 Orchestrator' }, style: { background: '#10b981', color: 'white', border: 'none', borderRadius: 8, padding: 10 } },
  { id: 'worker-1', position: { x: 100, y: 200 }, data: { label: 'Worker: code' }, style: { background: '#1f1f23', color: 'white', border: '1px solid #10b981', borderRadius: 8, padding: 10 } },
  { id: 'worker-2', position: { x: 300, y: 200 }, data: { label: 'Worker: research' }, style: { background: '#1f1f23', color: 'white', border: '1px solid #10b981', borderRadius: 8, padding: 10 } },
  { id: 'worker-3', position: { x: 500, y: 200 }, data: { label: 'Worker: review' }, style: { background: '#1f1f23', color: 'white', border: '1px solid #10b981', borderRadius: 8, padding: 10 } }
];

const edges: Edge[] = [
  { id: 'e-o1', source: 'orchestrator', target: 'worker-1', animated: true, style: { stroke: '#10b981' } },
  { id: 'e-o2', source: 'orchestrator', target: 'worker-2', animated: true, style: { stroke: '#10b981' } },
  { id: 'e-o3', source: 'orchestrator', target: 'worker-3', animated: true, style: { stroke: '#10b981' } }
];

export function OrchestratorGraphModal({ open, onOpenChange, threadId: _threadId }: { open: boolean; onOpenChange: (o: boolean) => void; threadId: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>多智能体编排可视化</DialogTitle>
        </DialogHeader>
        <div className="h-[500px] rounded-md border bg-card">
          <ReactFlow nodes={nodes} edges={edges} fitView>
            <Background color="#333" gap={16} />
            <Controls />
          </ReactFlow>
        </div>
        <p className="text-xs text-muted-foreground">
          实际编排数据由后端推送 — 此处展示静态拓扑示例。Phase 1 将接入真实 stream 渲染动态路由。
        </p>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5:** 提交
```bash
git add web-demo/components/chat/use-chat-stream.ts web-demo/components/chat/composer.tsx web-demo/components/chat/orchestrator-graph-modal.tsx web-demo/components/chat/message-list.tsx
git commit -m "feat(web-demo): chat SSE stream hook + composer + orchestrator graph"
```

---

### Task 18: Login 页 + 全局错误处理 + Connection Banner

**Files:**
- Create: `web-demo/app/login/page.tsx`
- Create: `web-demo/app/error.tsx`
- Create: `web-demo/app/loading.tsx`
- Create: `web-demo/app/not-found.tsx`
- Create: `web-demo/components/shared/connection-banner.tsx`
- Create: `web-demo/components/shared/error-state.tsx`
- Create: `web-demo/hooks/use-gateway-status.ts`

- [ ] **Step 1:** 创建 `web-demo/hooks/use-gateway-status.ts`(定期 ping gateway)
```typescript
'use client';
import { useEffect, useState } from 'react';
import { checkGatewayHealth } from '@/lib/gateway/health';

export function useGatewayStatus(intervalMs = 10000) {
  const [status, setStatus] = useState<'unknown' | 'ok' | 'down'>('unknown');
  useEffect(() => {
    let active = true;
    const tick = async () => {
      const r = await checkGatewayHealth();
      if (active) setStatus(r.ok ? 'ok' : 'down');
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { active = false; clearInterval(id); };
  }, [intervalMs]);
  return status;
}
```

- [ ] **Step 2:** 创建 `web-demo/components/shared/connection-banner.tsx`
```typescript
'use client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useGatewayStatus } from '@/hooks/use-gateway-status';
import { WifiOff } from 'lucide-react';

export function ConnectionBanner() {
  const status = useGatewayStatus();
  if (status !== 'down') return null;
  return (
    <div className="sticky top-14 z-20 px-4 pt-2">
      <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
        <WifiOff className="h-4 w-4" />
        <AlertTitle>Gateway 连接已断开</AlertTitle>
        <AlertDescription>实时数据可能过期。系统将自动重连,请检查 uvicorn 是否在运行。</AlertDescription>
      </Alert>
    </div>
  );
}
```

- [ ] **Step 3:** 创建 `web-demo/components/ui/alert.tsx`
```typescript
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        destructive: 'border-destructive/50 text-destructive [&>svg]:text-destructive'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);
export const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  )
);
Alert.displayName = 'Alert';
export const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h5 ref={ref} className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
);
AlertTitle.displayName = 'AlertTitle';
export const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
);
AlertDescription.displayName = 'AlertDescription';
```

- [ ] **Step 4:** 把 ConnectionBanner 加到根 layout(在 children 之后)
```typescript
// app/layout.tsx 中,在 <Providers><GatewayHealthGate>{children}</GatewayHealthGate></Providers> 内追加
import { ConnectionBanner } from '@/components/shared/connection-banner';
...
<Providers>
  <GatewayHealthGate>
    {children}
    <ConnectionBanner />
  </GatewayHealthGate>
</Providers>
```

- [ ] **Step 5:** 创建 `web-demo/app/error.tsx`
```typescript
'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Global error:', error); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <h1 className="mb-2 text-xl font-semibold">出错了</h1>
        <p className="mb-1 text-sm text-muted-foreground">{error.message}</p>
        {error.digest && <p className="mb-4 text-xs text-muted-foreground">错误 ID: {error.digest}</p>}
        <Button onClick={() => reset()}>重试</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6:** 创建 `web-demo/app/loading.tsx`
```typescript
import { Loader2 } from 'lucide-react';
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
```

- [ ] **Step 7:** 创建 `web-demo/app/not-found.tsx`
```typescript
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="text-center">
        <div className="text-6xl font-bold text-qilin-500">404</div>
        <h1 className="mt-3 text-xl font-semibold">页面未找到</h1>
        <p className="mt-2 text-sm text-muted-foreground">你访问的页面不存在</p>
        <Button asChild className="mt-6"><Link href="/"><Home className="mr-2 h-4 w-4" />返回首页</Link></Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8:** 创建 `web-demo/app/login/page.tsx`
```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { authApi } from '@/lib/api';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.login({ username, password });
      toast.success('登录成功');
      router.push('/');
    } catch (err) {
      toast.error(`登录失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-10 w-10 rounded-md bg-qilin-500" />
          <CardTitle>QiLin Demo</CardTitle>
          <CardDescription>登录以使用本地账户</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? '登录中…' : '登录'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 9:** 创建 `web-demo/components/ui/label.tsx`
```typescript
'use client';
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;
```

- [ ] **Step 10:** 提交
```bash
git add web-demo/app/error.tsx web-demo/app/loading.tsx web-demo/app/not-found.tsx web-demo/app/login/ web-demo/app/layout.tsx web-demo/components/shared/connection-banner.tsx web-demo/components/ui/alert.tsx web-demo/components/ui/label.tsx web-demo/hooks/use-gateway-status.ts
git commit -m "feat(web-demo): login + global error/loading/not-found + connection banner"
```

---

### Task 19: 集成测试 + 类型检查 + 完整验证

**Files:**
- Modify: `web-demo/tests/components/chat/message-item.test.tsx`
- Create: `web-demo/tests/components/skills/skill-card.test.tsx`
- Create: `web-demo/tests/components/shared/data-table.test.tsx`

- [ ] **Step 1:** 创建 `web-demo/tests/components/chat/message-item.test.tsx`
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageItem } from '@/components/chat/message-item';

describe('MessageItem', () => {
  it('renders user message', () => {
    render(<MessageItem message={{ id: '1', role: 'user', content: 'hello', created_at: '' }} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders assistant message with markdown', () => {
    render(<MessageItem message={{ id: '2', role: 'assistant', content: '# title', created_at: '' }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'title' })).toBeInTheDocument();
  });

  it('shows streaming indicator', () => {
    render(<MessageItem message={{ id: '3', role: 'assistant', content: '', created_at: '' }} isStreaming />);
    expect(screen.getByText(/思考中/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2:** 创建 `web-demo/tests/components/skills/skill-card.test.tsx`
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillCard } from '@/components/skills/skill-card';

describe('SkillCard', () => {
  it('renders skill name and description', () => {
    render(<SkillCard skill={{ name: 'web-search', description: 'Search the web', source: 'builtin', enabled: true }} onSelect={vi.fn()} />);
    expect(screen.getByText('web-search')).toBeInTheDocument();
    expect(screen.getByText(/Search the web/)).toBeInTheDocument();
  });

  it('fires toggle when switch is clicked', () => {
    const onToggle = vi.fn();
    render(<SkillCard skill={{ name: 'x', description: 'd', source: 'builtin', enabled: false }} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ name: 'x' }), true);
  });
});
```

- [ ] **Step 3:** 创建 `web-demo/tests/components/shared/data-table.test.tsx`
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';

interface Row { id: string; name: string; }

const cols: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' }
];

describe('DataTable', () => {
  it('renders rows and headers', () => {
    render(<DataTable data={[{ id: '1', name: 'foo' }]} columns={cols} />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('foo')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<DataTable data={[]} columns={cols} emptyMessage="没有数据" />);
    expect(screen.getByText('没有数据')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4:** 完整 typecheck
```bash
cd web-demo && pnpm typecheck 2>&1 | tail -20
```
期望:无 error

- [ ] **Step 5:** 完整测试
```bash
cd web-demo && pnpm test 2>&1 | tail -20
```
期望:全部测试通过(预期 12+)

- [ ] **Step 6:** 完整 lint
```bash
cd web-demo && pnpm lint 2>&1 | tail -10
```
期望:无 error

- [ ] **Step 7:** 提交
```bash
git add web-demo/tests/components/
git commit -m "test(web-demo): component tests for MessageItem / SkillCard / DataTable"
```

---

### Task 20: 完整启动验证 + README 完善

**Files:**
- Modify: `web-demo/README.md`

- [ ] **Step 1:** 替换 `web-demo/README.md` 完整内容
```markdown
# QiLin Web Demo

> **Phase 0 MVP** · 生产级演示应用 · 直连 `app/gateway`

## 功能 / Features

- 总览仪表盘(线程 / 运行 / 技能 / 模型统计)
- Chat(SSE 流式 · 工具调用卡片 · SubAgent 卡片 · 多智能体编排可视化)
- 线程管理(列表 · 搜索 · 详情 Drawer)
- 运行管理(列表 · 状态徽章 · Token 用量 · 详情)
- 技能市场(网格视图 · 来源过滤 · 启用切换 · 上传拖拽 · 扫描进度)
- 全局布局(侧边栏导航 P0-P3 进度可视化 · 主题切换 · Gateway 健康横幅)

## 系统要求

- Node.js ≥ 20
- pnpm ≥ 9
- QiLin `app/gateway` 在 `http://127.0.0.1:8080` 运行

## 启动 / Quick Start

### 1. 启动 QiLin Gateway

```bash
# 在 QiLin 仓库根目录
cd QiLin/
uv pip install -e ".[gateway]"
uvicorn app.gateway.app:app --port 8080
```

### 2. 启动 Web Demo

```bash
cd QiLin/web-demo/
pnpm install
cp .env.example .env.local
pnpm dev
# → http://localhost:3000
```

启动时 Web Demo 会自动检查 Gateway 健康状态,不健康会显示错误页。

## 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `GATEWAY_BASE_URL` | `http://127.0.0.1:8080` | Gateway 地址 |
| `GATEWAY_AUTH_TOKEN` | (空) | 可选 Bearer Token |
| `NEXT_PUBLIC_APP_NAME` | `QiLin Demo` | 应用名(显示在 Topbar) |

## 测试

```bash
pnpm test          # Vitest 单元/组件测试
pnpm typecheck     # TypeScript strict 检查
pnpm lint          # ESLint
pnpm build         # 生产构建
```

## 架构

参见 [docs/superpowers/specs/2026-08-24-web-demo-design.md](../docs/superpowers/specs/2026-08-24-web-demo-design.md)

## 路线图

- [x] **Phase 0** — Chat + Threads + Runs + Skills(本版本)
- [ ] **Phase 1** — Tools / MCP / Memory / Uploads
- [ ] **Phase 2** — Channels / Scheduler / Models / Config
- [ ] **Phase 3** — Authz / Guardrails / Sandbox / Tracing / Persistence / Reflection / WorkspaceChanges / Community / Integrations
```

- [ ] **Step 2:** 启动 dev server 端到端验证(假设 gateway 已启动)
```bash
cd /Users/libing/kk_Projects/QiLin
# 确保 uvicorn 在 8080 跑
cd web-demo && pnpm dev &
sleep 10

# 测试各路由
for url in / /threads /runs /skills /chat; do
  echo "=== $url ==="
  curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000$url
done
kill %1 2>/dev/null
```
期望:全部 HTTP 200(若 gateway 没起,首页会显示健康检查失败页但仍 200;其他页可能因数据获取失败显示空态)

- [ ] **Step 3:** 最终提交
```bash
git add web-demo/README.md
git commit -m "docs(web-demo): Phase 0 README with quick start + roadmap"
```

- [ ] **Step 4:** 推送所有提交
```bash
cd /Users/libing/kk_Projects/QiLin
git push origin main
```

---

## 自评审 / Self-Review Checklist

- [x] **Spec coverage:**
  - §3 目录结构 → Task 0-19(全部实现)
  - §3.2 数据流(SSR + SSE 直连)→ Task 5(health)、Task 6(api client)、Task 7(SSE hook)、Task 15-17(Chat 流式)
  - §4 设计语言(暗色 + 青龙)→ Task 3(globals.css + Tailwind)、Task 8(theme-toggle)、Task 9(sidebar/topbar)
  - §4.3 Chat 三页详细设计 → Task 15-17
  - §5 Phase 0 范围 → Task 0-20
  - §6 错误处理 → Task 5(GatewayHealthGate)、Task 7(SSE 指数退避)、Task 18(error.tsx + ConnectionBanner)
  - §7 测试 → Task 6/7/19
  - §8 部署与启动 → Task 20

- [x] **Placeholder scan:** 无 TBD / TODO / "fill in"/"similar to";所有代码块完整可执行;Task 18 Step 4 引用了 layout 修改(在 Step 内给出明确指引)

- [x] **Type consistency:**
  - `gatewayFetch<T>` 在 Task 6 定义,Tasks 11/13/15/18 复用一致
  - `DisplayMessage.tool_calls_display` 数组结构在 Task 16/17 一致
  - `StreamEvent` discriminated union 在 Task 4 / 7 / 17 联合使用一致
  - `Thread.thread_id` / `Run.run_id` / `Skill.name` 在各 table 中一致引用

- [x] **No "implement later":** 所有 20 个 Task 都有具体代码与命令

---

## 执行选项

**Plan complete and saved to `plans/2026-08-24-web-demo-phase0.md`(20 个 Task,涵盖 Phase 0 全部范围)。**

两种执行方式:

1. **Subagent-Driven(recommended)** — 每 Task 派一个新 subagent 执行,你在 Task 间 review,迭代快
2. **Inline Execution** — 在当前会话连续执行,批量推进 + 检查点

**鉴于你已经选择了 Inline / 单 agent 路径**,我会按 Task 顺序在当前会话执行,每 Task 完成提交后报告进度,关键里程碑(gateway 接入验证 / 首屏加载验证)暂停等你 review。

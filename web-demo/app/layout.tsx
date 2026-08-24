import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import { GatewayHealthGate } from '@/components/shared/gateway-health-gate';
import { ConnectionBanner } from '@/components/shared/connection-banner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'QiLin Demo',
  description: 'Production-grade Web demo for QiLin multi-agent engine'
};

/**
 * 把 server 端 cookies() 读到的 csrf_token 通过 inline script 写到客户端 cookie。
 *
 * 为什么需要这一步:Gateway 在 8081 set 的 csrf_token cookie 虽然会被浏览器带到
 * 8081 的请求里(credentials: 'include'),但 `document.cookie` API 在 3001 页面
 * 上读不到 8081 set 的 cookie(浏览器对 set-cookie host 的实现不一致),
 * 导致 client.ts 的 getCsrfToken() 返回 null,没法注入 X-CSRF-Token header。
 *
 * 这段 script 把 csrf_token 镜像到同源 cookie,前端就能 document.cookie 读到。
 */
function CookieMirrorScript({ csrfToken }: { csrfToken: string }) {
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=${JSON.stringify(csrfToken)};if(t&&document.cookie.indexOf('csrf_token=')===-1){document.cookie='csrf_token='+encodeURIComponent(t)+'; Path=/; SameSite=Lax';}}catch(e){}})();`
      }}
    />
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const csrfToken = (await cookies()).get('csrf_token')?.value ?? '';
  return (
    <html lang="zh-CN" suppressHydrationWarning className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        {csrfToken ? <CookieMirrorScript csrfToken={csrfToken} /> : null}
        <Providers>
          <GatewayHealthGate>
            {children}
            <ConnectionBanner />
          </GatewayHealthGate>
        </Providers>
      </body>
    </html>
  );
}

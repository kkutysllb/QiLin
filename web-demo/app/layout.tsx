import type { Metadata } from 'next';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
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

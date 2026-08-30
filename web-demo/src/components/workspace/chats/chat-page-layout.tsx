/**
 * 双路由聊天页共享 layout：Next.js 纯透传布局 + 静态导出参数工厂。
 *
 * generateStaticParams 必须由各路由 layout 模块具名导出，因此以工厂形式
 * 提供，两个 layout 文件只保留各自的静态导出参数差异。
 */
export function ChatPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

export function makeChatLayoutGenerateStaticParams(
  params: Record<string, string>,
) {
  return function generateStaticParams() {
    return [params];
  };
}
